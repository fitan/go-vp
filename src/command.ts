import path from 'path';
import * as vscode from 'vscode';
import os from 'os';

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
