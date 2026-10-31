import { StreamLanguage } from '@codemirror/language';

export const latexLanguage = StreamLanguage.define({
  name: 'latex',
  token(stream) {
    if (stream.match(/%.*/)) return 'comment';
    if (stream.match(/\\(?:[a-zA-Z@]+|.)/)) return 'keyword';
    if (stream.match(/\$\$?|[{}\[\]]/)) return 'bracket';
    if (stream.match(/#[1-9]/)) return 'variableName';
    stream.next(); return null;
  },
  languageData: { commentTokens: { line: '%' } },
});

export const typstLanguage = StreamLanguage.define({
  name: 'typst',
  startState: () => ({ comment: false }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo('*/')) { stream.match('*/'); state.comment = false; } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/*')) { state.comment = true; return 'comment'; }
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.sol() && stream.match(/=+\s/)) { stream.skipToEnd(); return 'heading'; }
    if (stream.match(/#(?:let|set|show|if|else|for|while|import|include|return|context)\b/)) return 'keyword';
    if (stream.match(/#[\w-]+/)) return 'variableName';
    if (stream.match(/\b\d+(?:\.\d+)?(?:pt|mm|cm|in|em|%)?/)) return 'number';
    if (stream.match(/[{}\[\]()$]/)) return 'bracket';
    stream.next(); return null;
  },
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
});
