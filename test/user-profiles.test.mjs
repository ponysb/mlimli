import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { withRunContext } from '../core/run-context.mjs';
import { listUserProfiles, saveUserProfile, setActiveUserProfile, deleteUserProfile, activeUserProfilePrompt, userProfileSnapshot, learnUserProfile, reviewUserProfileUpdate } from '../core/user-profiles.mjs';
import { saveMemory, listMemories } from '../core/memory.mjs';
import { setConfig } from '../core/llm.mjs';
import { buildSystemPrompt } from '../core/prompts.mjs';
import { updateMemorySettings } from '../core/memory-policy.mjs';

function fixture(t, profileOwnerId = 'user-a') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-profiles-'));
  const context = { memoryDataRoot: root, profileOwnerId };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, context, run: fn => withRunContext(context, fn) };
}

test('多张档案可切换，档案快照和个人偏好记忆按账户及档案隔离', t => {
  const { context, run } = fixture(t);
  run(() => {
    const one = saveUserProfile({ displayName: '林舟', role: '产品负责人', preferences: '先给结论' });
    const two = saveUserProfile({ displayName: '陈禾', role: '工程师', preferences: '给出验证证据' });
    assert.equal(listUserProfiles().profiles.length, 2);
    assert.equal(listUserProfiles().activeId, one.id);
    saveMemory({ scope: 'global', kind: 'preference', content: '林舟偏好简洁结论', evidence: '档案偏好' });
    const frozen = userProfileSnapshot();
    assert.match(activeUserProfilePrompt(), /林舟/);
    setActiveUserProfile(two.id);
    assert.match(activeUserProfilePrompt(), /陈禾/);
    assert.equal(listMemories({ scope: 'global' }).length, 0);
    saveMemory({ scope: 'global', kind: 'preference', content: '陈禾偏好测试证据', evidence: '档案偏好' });
    assert.equal(listMemories({ scope: 'global' }).length, 1);
    assert.equal(listMemories({ scope: 'global' })[0].content, '陈禾偏好测试证据');
    withRunContext({ ...context, userProfileSnapshot: frozen }, () => {
      assert.equal(userProfileSnapshot().active.displayName, '林舟');
      assert.equal(listMemories({ scope: 'global' })[0].content, '林舟偏好简洁结论');
    });
    const otherAccount = withRunContext({ ...context, profileOwnerId: 'user-b' }, () => listUserProfiles());
    assert.equal(otherAccount.profiles.length, 0);
    assert.equal(setActiveUserProfile('').active, null);
    assert.equal(listUserProfiles().active, null);
    assert.throws(() => deleteUserProfile(two.id, 99), error => error.status === 409);
    deleteUserProfile(two.id, two.revision);
    assert.equal(listUserProfiles().profiles.length, 1);
  });
});

test('档案卡字段受限、凭据脱敏且损坏存储不会被覆盖', t => {
  const { root, run } = fixture(t);
  run(() => {
    const profile = saveUserProfile({ displayName: '测试用户', preferences: 'token=secret123456', unexpected: '不要存储' });
    assert.ok(!JSON.stringify(profile).includes('secret123456'));
    assert.equal(profile.unexpected, undefined);
    const file = path.join(root, 'user-profiles', userProfileSnapshot().memoryKey.split('/')[0], 'profiles.json');
    fs.writeFileSync(file, '{broken');
    assert.throws(() => saveUserProfile({ displayName: '覆盖损坏数据' }), /无法读取/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  });
});

test('日常自述自动建卡补空字段，冲突须审核且过期快照不覆盖人工修改', t => {
  const { run } = fixture(t);
  run(() => {
    const snapshot = userProfileSnapshot();
    const profile = learnUserProfile([{ field: 'displayName', value: '林舟', quote: '我叫林舟', entryId: 1 }, { field: 'role', value: '产品负责人', quote: '我是产品负责人', entryId: 1 }], { snapshot, sessionId: 's', turnId: 't' });
    assert.equal(profile.displayName, '林舟'); assert.equal(profile.role, '产品负责人');
    assert.equal(profile.fieldEvidence.role.quote, '我是产品负责人');
    const old = userProfileSnapshot();
    const updated = learnUserProfile([{ field: 'role', value: '技术负责人', quote: '现在我是技术负责人', entryId: 2 }], { snapshot: old });
    assert.equal(updated.role, '产品负责人'); assert.equal(updated.pending.length, 1);
    const approved = reviewUserProfileUpdate(updated.id, updated.pending[0].id, updated.revision, true);
    assert.equal(approved.role, '技术负责人');
    assert.equal(learnUserProfile([{ field: 'team', value: '旧团队', quote: '旧团队', entryId: 1 }], { snapshot: old }), null);
    assert.equal(listUserProfiles().active.team, '');
  });
});

test('关闭记忆时不注入档案；所有常见凭据格式脱敏', t => {
  const { run } = fixture(t);
  setConfig({ memory: {} });
  run(() => {
    const item = saveUserProfile({ displayName: '私有称呼', preferences: 'api_key=secret12345 Bearer abcdefghijklmnop password=anotherSecret' });
    assert.ok(!JSON.stringify(item).includes('secret12345'));
    assert.ok(!JSON.stringify(item).includes('abcdefghijklmnop'));
    assert.match(buildSystemPrompt({}), /私有称呼/);
    updateMemorySettings({ enabled: false });
    assert.ok(!buildSystemPrompt({}).includes('私有称呼'));
  });
});

test('跨账户快照不能自动建卡；无效字段不创建档案；审核及人工修改冲突受版本保护', t => {
  const { context, run } = fixture(t);
  run(() => {
    const snapshot = userProfileSnapshot();
    assert.equal(withRunContext({ ...context, profileOwnerId: 'other' }, () => learnUserProfile([{ field: 'role', value: '工程师', quote: '我是工程师' }], { snapshot })), null);
    assert.equal(learnUserProfile([null, { field: '__proto__', value: 'test', quote: 'test' }], { snapshot }), null);
    const profile = learnUserProfile([{ field: 'role', value: '工程师', quote: '我是工程师' }], { snapshot, reviewBeforeSave: true });
    assert.equal(profile.role, ''); assert.equal(profile.pending.length, 1);
    const edited = saveUserProfile({ id: profile.id, expectedRevision: profile.revision, role: '设计师' });
    assert.throws(() => reviewUserProfileUpdate(edited.id, profile.pending[0].id, profile.revision, true), error => error.status === 409);
    assert.throws(() => reviewUserProfileUpdate(edited.id, profile.pending[0].id, edited.revision, true), error => error.status === 409);
    assert.equal(reviewUserProfileUpdate(edited.id, profile.pending[0].id, edited.revision, false).pending.length, 0);
  });
});

test('档案容量有界、重复建议不膨胀、人工修改清理旧证据', t => {
  const { run } = fixture(t);
  run(() => {
    const profile = learnUserProfile([{ field: 'role', value: '工程师', quote: '我是工程师' }], { snapshot: userProfileSnapshot() });
    const update = [{ field: 'role', value: '设计师', quote: '我是设计师' }];
    const proposed = learnUserProfile(update, { snapshot: userProfileSnapshot() });
    assert.equal(learnUserProfile(update, { snapshot: userProfileSnapshot() }), null);
    assert.equal(listUserProfiles().active.pending.length, 1);
    const edited = saveUserProfile({ id: profile.id, expectedRevision: proposed.revision, role: '负责人' });
    assert.equal(edited.fieldEvidence.role, undefined);
    for (let index = 1; index < 50; index++) saveUserProfile({ displayName: `成员 ${index}` });
    assert.throws(() => saveUserProfile({ displayName: '超额档案' }), /50/);
    assert.equal(listUserProfiles().profiles.length, 50);
  });
});

test('档案路径拒绝符号链接越界，外部文件保持原样', t => {
  const { root, run } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-profile-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const owner = crypto.createHash('sha256').update('user-a').digest('hex');
  fs.mkdirSync(path.join(root, 'user-profiles'));
  fs.symlinkSync(outside, path.join(root, 'user-profiles', owner), process.platform === 'win32' ? 'junction' : 'dir');
  run(() => assert.throws(() => saveUserProfile({ displayName: '越界资料' }), /越界/));
  assert.equal(fs.existsSync(path.join(outside, 'profiles.json')), false);
});
