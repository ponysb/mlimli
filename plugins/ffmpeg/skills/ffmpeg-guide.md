---
name: ffmpeg-guide
description: 使用 FFmpeg 处理工作区内的音视频文件时的参数和安全规则
---

# FFmpeg 媒体处理

所有输入文件必须位于当前工作区或应用目录，所有输出文件必须写入当前工作区。先用 `ffmpeg_probe` 确认媒体流，再根据需要使用转码、裁剪、拼接、提取音频或缩略图工具。工具使用参数数组调用 FFmpeg，不接受 shell 命令字符串。
