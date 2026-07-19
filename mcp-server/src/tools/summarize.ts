export function extractSummary(text:string,n:number):string{const sentences=text.match(/[^.!?]+[.!?]+/g)??[text];return sentences.slice(0,n).join(' ').trim()}
