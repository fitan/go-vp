import path from 'path';
import * as vscode from 'vscode';
import os from 'os';

export function jumpToInterface(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('mytest.jumpToInterface', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {

            let symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                editor.document.uri
            );

            if (!symbols) {
                return;
            }

            let items = symbols.filter(symbol => symbol.kind === vscode.SymbolKind.Interface).map(symbol => {
                return {
                    label: symbol.name,
                    description: symbol.detail,
                    detail: '',
                    symbol: symbol,
                };
            });

            vscode.window.showQuickPick(items).then(item => {
                if (item) {
                    editor.revealRange(item.symbol.range);
                }
            });
        }
    });

    context.subscriptions.push(disposable);

}

export function goGenerate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('mytest.goGenerate', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const platform = os.platform();
            const goCmd = platform === 'win32' ? 'go.exe' : 'go';
            const dir = path.dirname(editor.document.uri.fsPath);
            const terminal = vscode.window.createTerminal({
                name: `${goCmd} generate`,
                cwd: dir,
            });

            terminal.show();

            terminal.sendText('go generate');
        }
    });

    context.subscriptions.push(disposable);
}
