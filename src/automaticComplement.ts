import * as vscode from 'vscode';

let completionKey: Array<string> = ["@gq", "@gq-column", "@gq-sub", "@gq-group", "@gq-clause", "@gq-op", "@gq-struct",
    "@kit-http", "@kit-http-request", "@kit-http-service",
    "@tags", "@basePath", "@otel",
    "@do", "@kit", "@temporal"
];
export function automaticComplement(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { pattern: "**/*.go" },
            {
                provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                    // const linePrefix = document.lineAt(position).text.substring(0, position.character);
                    // if (linePrefix.endsWith('// @')) {
                    return completionKey.map(item => {
                        return new vscode.CompletionItem(item.substring(1), vscode.CompletionItemKind.Method);
                    });
                    // return [
                    //     new vscode.CompletionItem('kit-http', vscode.CompletionItemKind.Method),
                    //     new vscode.CompletionItem('kit-http-request', vscode.CompletionItemKind.Method),
                    //     new vscode.CompletionItem('kit-http-service', vscode.CompletionItemKind.Method),
                    //     new vscode.CompletionItem('tags', vscode.CompletionItemKind.Method),
                    //     new vscode.CompletionItem('basePath', vscode.CompletionItemKind.Method),
                    //     new vscode.CompletionItem('kit-http-param ctx', vscode.CompletionItemKind.Method),
                    // ];
                }
                //  else {
                // return undefined;
                // }
            },
            '// @',
            // ...['// @k'],
        ));
}