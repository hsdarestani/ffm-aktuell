import {readFileSync} from 'node:fs';
import ts from 'typescript';
/** Legacy structure checks inspect the default German UI independently of localization syntax. */
export function readUiSource(path){
 let source=readFileSync(path,'utf8');const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(n){
  if(ts.isCallExpression(n)&&n.expression.getText(file)==='ui'&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])){
   let start=n.getStart(file),end=n.end,text="'"+n.arguments[0].text.replaceAll('\\','\\\\').replaceAll("'","\\'").replaceAll('\n','\\n')+"'";
   if(ts.isJsxExpression(n.parent)&&n.parent.expression===n){start=n.parent.getStart(file);end=n.parent.end;text=ts.isJsxAttribute(n.parent.parent)?JSON.stringify(n.arguments[0].text):n.arguments[0].text}
   edits.push({start,end,text});return;
  }ts.forEachChild(n,visit);
 }visit(file);for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);return source;
}
