import * as vscode from 'vscode';


export function automaticComplement(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { pattern: "**/*.go" },
            {
                provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                    const linePrefix = document.lineAt(position).text.substring(0, position.character);
                    if (linePrefix.endsWith('// @')) {
                        return [
                            new vscode.CompletionItem('kit-http', vscode.CompletionItemKind.Method),
                            new vscode.CompletionItem('kit-http-request', vscode.CompletionItemKind.Text),
                            new vscode.CompletionItem('kit-http-service', vscode.CompletionItemKind.Text),
                            new vscode.CompletionItem('tags', vscode.CompletionItemKind.Text),
                            new vscode.CompletionItem('basePath', vscode.CompletionItemKind.Text),
                            new vscode.CompletionItem('kit-http-param ctx', vscode.CompletionItemKind.Text),
                        ];
                    } else {
                        return undefined;
                    }
                }
            },
            '// @',
            // ...['// @k'],
        ));
}