// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SymbolInfo } from './watch';
import { goGenerate } from './command';
import { automaticComplement } from './automaticComplement';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	goGenerate(context);
	// 不好使
	automaticComplement(context);


	let sInfo = new SymbolInfo;
	console.log('Congratulations, your extension "mytest" is now active!');
	sInfo.first().then(() => {
		console.log('first over', vscode.window.activeTextEditor?.document.uri);
		if (vscode.window.activeTextEditor) {
			console.log('activeTextEditor in sinfo first', vscode.window.activeTextEditor);
			sInfo.debounceHighlightComments(vscode.window.activeTextEditor);
			vscode.window.showInformationMessage('Open note object jump!!!');
		};

		sInfo.watch(context);
		sInfo.definitionProvider(context);
		sInfo.gqAutomaticComplement(context);
	});;


	// let codelensProvider = vscode.languages.registerCodeLensProvider({ language: 'go' }, {
	// 	provideCodeLenses(document, token) {
	// 		const symbols = getDocumentSymbols(document.uri);
	// 		symbols.then(symbols => {
	// 			console.log('my symbols', symbols);
	// 		});
	// 		return symbols.then(symbols => {
	// 			return symbols.map(symbol => {
	// 				console.log('symbol', symbol.location.uri.toString());
	// 				let range = symbol.location.range;
	// 				let codeLens = new vscode.CodeLens(range);
	// 				codeLens.command = {
	// 					title: 'My Command',
	// 					command: 'mytest.helloWorld',
	// 					arguments: [symbol.location.uri, range.start]
	// 				};
	// 				return codeLens;
	// 			});
	// 		});
	// 	}
	// });




	// getAllDocumentSymbols();



}

// async function getAllDocumentSymbols() {
// 	const editor = vscode.window.activeTextEditor;
// 	if (editor) {
// 		const documnet = editor.document;
// 		const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', documnet.uri);
// 		if (symbols) {
// 			console.log('所有文档的', symbols);
// 		}
// 	}
// }

// async function getDocumentSymbols(uri: vscode.Uri) {
// 	const document = await vscode.workspace.openTextDocument(uri);
// 	let symbols = (await vscode.commands.executeCommand<
// 		(vscode.SymbolInformation & vscode.DocumentSymbol)[]
// 	>('vscode.executeDocumentSymbolProvider', document.uri))!.filter(
// 		s =>
// 			s.kind === vscode.SymbolKind.Function ||
// 			s.kind === vscode.SymbolKind.Method ||
// 			s.kind === vscode.SymbolKind.Class
// 	);

// 	return symbols
// }

// function highlightComments(editor: vscode.TextEditor) {
// 	const doc = editor.document;
// 	const text = doc.getText();
// 	const comments = text.match(/\/\/.*/g);
// 	const regex: RegExp = /HelloReques/g;
// 	if (comments) {
// 		const decorations = comments.map(comment => {
// 			const s = "HelloRequest";
// 			const match = regex.exec(comment);
// 			if (match) {
// 				const startPos = doc.positionAt(text.indexOf(s));
// 				const endPos = doc.positionAt(text.indexOf(s) + s.length);
// 				const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'I am a hover!' };
// 				return decoration;
// 			} else {
// 				return null;
// 			}
// 		}).filter(decoration => decoration !== null) as vscode.DecorationOptions[];
// 		editor.setDecorations(vscode.window.createTextEditorDecorationType({ backgroundColor: 'yellow' }), decorations);
// 	}
// }

// This method is called when your extension is deactivated
export function deactivate() { }