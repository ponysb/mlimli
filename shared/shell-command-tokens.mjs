// Presentation only: never executes, expands or validates shell syntax.
export function shellCommandTokens(input) {
 const parts=String(input).match(/#[^\n]*|'[^']*'?|"(?:\\.|[^"\\])*"?|\$\{[^}]*\}?|\$[\w?@#!$]+|(?:&&|\|\||[|;&<>])|\s+|[^\s'"$|;&<>]+|./g)||[];
 let expectCommand=true;
 return parts.map(text=>{let type='plain';if(/^\s+$/.test(text))return {text,type};if(/^#/.test(text))type='comment';else if(/^["']/.test(text))type='string';else if(/^\$/.test(text))type='variable';else if(/^(?:&&|\|\||[|;&<>])$/.test(text)){type='operator';expectCommand=true;return {text,type};}else if(/^-/.test(text))type='option';else if(/^(if|then|else|elif|fi|for|while|do|done|case|esac|in|function)$/.test(text))type='keyword';else if(expectCommand)type='command';if(!/^[A-Za-z_][\w]*=/.test(text))expectCommand=false;return {text,type};});
}
