import * as vscode from 'vscode';
import * as path from 'path';
import { workerData } from 'worker_threads';
import { start } from 'repl';

const trimBracketsRegex = /\(.+?\)$/g;

// 定义一个包括点的单词模式
const wordPattern = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:'"\,\<\>\/\?\s]+)/g;


interface FileInfo {
    Symbol: vscode.DocumentSymbol[];
    PackageName: string;
    Imports: string[];
    PathDir: string;
    Uri: vscode.Uri;
}


export class SymbolInfo {
    async initialize() {
        this.moduleName = await this.getGoModuleName() || '';
    }

    moduleName: string = '';
    symbolsMap: Map<string, FileInfo> = new Map();
    DecorationsMap: Map<string, vscode.TextEditorDecorationType> = new Map();
    debounceHighlightComments: Function = this.debounceHC(this.highlightComments, vscode.workspace.getConfiguration('mytest').get('noteHigTriggerInterval') as number);
    debounceSetSymbol: Function = this.debounceSS(this.setSymbol, vscode.workspace.getConfiguration('mytest').get('noteHigTriggerInterval') as number);
    debounceArgsMap: Map<string, NodeJS.Timeout> = new Map();
    noteHighBrightColor: string = vscode.workspace.getConfiguration('mytest').get('noteHighBrightColor') as string;
    // v2


    index: Map<string, Set<vscode.Uri>> = new Map();

    async first() {
        return vscode.workspace.findFiles('**/*.go', '**/*_test.go').then(async (uris) => {
            const symbolPromises = uris.map((uri) => {
                return this.setSymbol(uri);
            });
            await Promise.all(symbolPromises);
        });
    }

    async getDocumentSymbols(uri: vscode.Uri): Promise<FileInfo | undefined> {
        return this.symbolsMap.get(uri.toString());
    }

    async setSymbol(uri: vscode.Uri) {
        let symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        let info: FileInfo = {
            Symbol: symbols || [],
            PackageName: await this.getPackageName(uri),
            Imports: this.getAndCheckImports(uri),
            PathDir: path.dirname(uri.fsPath),
            Uri: uri
        };

        this.symbolsMap.set(uri.toString(), info);
        this.index.get(`packageName#${info.PackageName}`)?.add(uri) || this.index.set(`packageName#${info.PackageName}`, new Set([uri]));
        this.index.get(`pathDir#${info.PathDir}`)?.add(uri) || this.index.set(`pathDir#${info.PathDir}`, new Set([uri]));
    }

    async delSymbol(uri: vscode.Uri) {
        this.symbolsMap.delete(uri.toString());
    }

    getAndCheckImports(uri: vscode.Uri): string[] {

        // 读取当前 Go 文件内容
        const content = vscode.workspace.fs.readFile(uri).toString();

        // 使用正则表达式解析 import 语句
        const importRegex = /^import\s+(?:"(.+?)"|\(([\s\S]+?)\))/gm;
        let match;
        const imports = [];
        while ((match = importRegex.exec(content)) !== null) {
            // 匹配单行 import 或多行 import
            if (match[1]) {
                imports.push(match[1]);
            } else if (match[2]) {
                match[2].split('\n').forEach(line => {
                    const importMatch = line.trim().match(/"(.+?)"/);
                    if (importMatch) {
                        imports.push(importMatch[1]);
                    }
                });
            }
        }

        return imports;

        // 假设你已经有了一个函数来获取当前项目的模块名
        // const moduleName = await getGoModuleName(); // 使用前一个回答中的函数

        // 判断 import 是否属于当前项目
        // const projectImports = imports.filter(imp => imp.startsWith(moduleName));
        ////  console.log('Project specific imports:', projectImports);
    }

    async getPackageName(uri: vscode.Uri) {
        return vscode.workspace.fs.readFile(uri).then((content) => {
            const cleanedText = content.toString().replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//gm, '');
            const packageDeclaration = cleanedText.match(/^package\s+(\w+)/m);
            if (packageDeclaration) {
                return packageDeclaration[1];
            } else {
                return "";
            }
        }
        );
    }



    async getGoModuleName() {
        // 查找 go.mod 文件
        const goModFiles = await vscode.workspace.findFiles('**/go.mod', '**/vendor/**', 1);
        if (goModFiles.length === 0) {
            return;
        }

        // 读取 go.mod 文件内容
        const goModUri = goModFiles[0];
        const goModContent = await vscode.workspace.fs.readFile(goModUri);
        const goModText = Buffer.from(goModContent).toString('utf8');

        // 解析模块名
        const moduleLine = goModText.split('\n').find(line => line.startsWith('module '));
        if (!moduleLine) {
            return;
        }

        const moduleName = moduleLine.substring('module '.length).trim();
        return moduleName;
    }

    checkWordEqSymbolByPkgNameAndWords(pkgName: string, words: string[]): string[] {
        let res: string[] = [];
        this.index.get(`packageName#${pkgName}`)?.forEach((uri) => {
            let fileInfo = this.symbolsMap.get(uri.toString());
            if (fileInfo) {
                fileInfo.Symbol.forEach((symbol) => {
                    if (words.includes(symbol.name)) {
                        res.push(symbol.name);
                    }
                });
            }
        });
        return res;
    }

    getSymbolByPkgNameAndName(pkgName: string, name: string): { uri: vscode.Uri | undefined; symbol: vscode.DocumentSymbol | undefined } {
        let indexs = this.index.get(`packageName#${pkgName}`);
        if (indexs) {
            for (let uri of indexs) {
                let fileInfo = this.symbolsMap.get(uri.toString());
                if (fileInfo) {
                    for (let symbol of fileInfo.Symbol) {
                        if (symbol.name === name) {
                            return { uri, symbol };
                        }
                    }
                }
            }
        }
        return { uri: undefined, symbol: undefined };
    }


    checkWordEqSymbolNameByUriAndWords(uri: vscode.Uri, words: string[]): string[] {
        let res: string[] = [];
        this.index.get(`pathDir#${path.dirname(uri.fsPath)}`)?.forEach((uri) => {
            let fileInfo = this.symbolsMap.get(uri.toString());
            if (fileInfo) {
                fileInfo.Symbol.forEach((symbol) => {
                    if (words.includes(symbol.name)) {
                        res.push(symbol.name);
                    }
                });
            }
        });
        return res;
    }

    getSymbolBySourceUriAndName(uri: vscode.Uri, name: string): { uri: vscode.Uri | undefined; symbol: vscode.DocumentSymbol | undefined } {
        let u: vscode.Uri | undefined = undefined;
        let s: vscode.DocumentSymbol | undefined = undefined;
        //         console.log("getSymbolBySourceUriAndName", uri.fsPath, name, path.dirname(uri.fsPath));
        this.index.get(`pathDir#${path.dirname(uri.fsPath)}`)?.forEach((uri) => {
            let fileInfo = this.symbolsMap.get(uri.toString());
            if (fileInfo) {
                fileInfo.Symbol.find((symbol) => {
                    if (symbol.name === name) {
                        u = uri;
                        s = symbol;
                        return true;
                    }
                });
            }
        });

        //         console.log("getSymbolBySourceUriAndName", u, s);
        return { uri: u, symbol: s };
    }

    getEqDirUrisByUri(uri: vscode.Uri): vscode.Uri[] {
        let uris: vscode.Uri[] = [];
        for (let [key, value] of this.symbolsMap) {
            if (path.dirname(value.Uri.fsPath) === path.dirname(uri.fsPath)) {
                uris.push(value.Uri);
            }
        }
        return uris;
    }


    async definitionProvider(context: vscode.ExtensionContext) {
        const that = this;
        const provider = vscode.languages.registerDefinitionProvider(
            { scheme: 'file', language: 'go' },
            {
                provideDefinition(document, position, token) {
                    let line = document.lineAt(position.line).text;
                    let word = document.getText(document.getWordRangeAtPosition(position, wordPattern));

                    if (line.includes('@gq-column') || line.includes('@gq-sub') || line.includes('@gq-struct')) {
                        //                         console.log("findGqColumn", document.uri, position, word);
                        return that.findGqColumn(document, position, word);
                    }

                    word = word.includes('(') ? word.replace(trimBracketsRegex, '') : word;
                    let symbol: vscode.DocumentSymbol | undefined = undefined;
                    let uri: vscode.Uri | undefined = undefined;
                    if (word.includes('.')) {
                        let wordSplit = word.split('.');
                        ({ uri, symbol } = that.getSymbolByPkgNameAndName(wordSplit[0], wordSplit[1]));
                    } else {
                        ({ uri, symbol } = that.getSymbolBySourceUriAndName(document.uri, word));
                    }

                    if (symbol && uri) {
                        // return vscode.workspace.openTextDocument(symbol.location.uri).then((doc) => {
                        //     let lastLine = doc.lineCount - 1;
                        //     let lastLineMaxCharacter = document.lineAt(lastLine).text.length; // 获取最后一行的字符数
                        //     let maxPosition = new vscode.Position(lastLine, lastLineMaxCharacter); // 创建一个新的 Position
                        //     let maxRange = new vscode.Range(symbol.location.range.start, maxPosition); // 创建一个新的 Range
                        //     return new vscode.Location(symbol.location.uri, maxRange);
                        // });
                        return new vscode.Location(uri, symbol.range);
                    } else {
                        return null;
                    }
                }
            }
        );
        context.subscriptions.push(provider);
    }

    debounceHC(func: Function, wait: number) {
        let timeout: NodeJS.Timeout;
        return function (this: any, td: vscode.TextDocument) {
            const context = this;
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                try {
                    func.apply(context, [td]);
                } catch (e) {
                    console.error(e);
                }
            }, wait);
        };

    }

    debounceSS(func: Function, wait: number) {
        return function (this: any, uri: vscode.Uri) {
            const context = this;
            clearTimeout(context.debounceArgsMap.get(uri.fsPath));
            const timeout = setTimeout(() => {
                try {
                    func.apply(context, [uri]);
                } catch (e) {
                    console.error(e);
                } finally {
                    context.debounceArgsMap.delete(uri.fsPath);
                    if (vscode.window.activeTextEditor?.document.uri.fsPath === uri.fsPath) {
                        context.debounceHighlightComments(vscode.window.activeTextEditor);
                    }
                }
            }, wait);
            context.debounceArgsMap.set(uri.fsPath, timeout);
        };

    };

    getDocLineNumByIndex(docIndex: number, doc: vscode.TextDocument): number {
        let index = 0;
        for (let i = 0; i < doc.lineCount; i++) {
            let line = doc.lineAt(i);
            if (index + line.text.length >= docIndex) {
                return i;
            }

            index += line.text.length;
        }
        return 0;
    }

    async highlightComments(editor: vscode.TextEditor) {
        const uri = editor.document.uri;
        const text = editor.document.getText();
        const doc = editor.document;
        const comments = text.match(/\/\/ .*/g);
        let fieldComments: string[] = [];
        comments?.forEach((comment) => {
            if (comment.includes('@gq-column')) {
                fieldComments.push(comment);
            }
            if (comment.includes('@gq-sub')) {
                fieldComments.push(comment);
            }
            if (comment.includes('@gq-struct')) {
                fieldComments.push(comment);
            }
        });

        let decorations: vscode.DecorationOptions[] = [];
        let checkedWords: string[] = [];

        if (comments) {
            let words: string[] = comments.map((comment) => {
                return comment.slice(2).split(/\s+/).filter((word) => /^[a-zA-Z].*[a-zA-Z)]$/.test(word));
            }).reduce((prev, curr) => {
                return prev.concat(curr.map((word) => {
                    if (word.includes('(')) {
                        return word.replace(trimBracketsRegex, '');
                    } else {
                        return word;
                    }
                }));
            }, []);
            words = [...new Set(words)];
            //             console.log("words: ", words);
            let localWords: string[] = [];
            let pkgWords: Map<string, string[]> = new Map();
            words.forEach((word) => {
                if (word.includes('.')) {
                    let pkgName = word.split('.')[0];
                    pkgWords.get(pkgName)?.push(word.split('.')[1]) || pkgWords.set(pkgName, [word.split('.')[1]]);
                } else {
                    localWords.push(word);
                }
            });


            let checkedLocalWords = this.checkWordEqSymbolNameByUriAndWords(uri, localWords);
            let checkedPkgWords: string[] = [];
            pkgWords.forEach((words, pkgName) => {
                checkedPkgWords.push(...this.checkWordEqSymbolByPkgNameAndWords(pkgName, words).map((symbolName) => `${pkgName}.${symbolName}`));
            });

            checkedWords = checkedLocalWords.concat(checkedPkgWords);

            let gqWords = ["@gq", "@gq-column", "@gq-sub", "@gq-group", "@gq-clause", "@gq-op", "@gq-struct",
                "@kit-http", "@kit-http-request", "@kit-http-service",
                "@tags", "@basePath", "@otel",
            ];
            checkedWords.push(...gqWords);

            if (!checkedWords.length) {
                return;
            }
        }

        ////  console.log("checkedWords", checkedWords);

        const lineRegex = new RegExp(`\\/\\/ .*`, 'g');

        // const wordRegex = new RegExp(`\\b(${checkedWords.join("|")})\\b`, 'g');
        const wordRegex = new RegExp(`(?<=^|\\s|\\t)(${checkedWords.join("|")})(?=$|\\s|\\t)`, 'g');
        const fieldRegex = new RegExp(`(?<=^|\\s|\\t)(\\w+)(?=$|\\s|\\t)`, 'g');

        let lineMatch;
        ////  console.log("wordRegex: ", `\\b(${checkedWords.join("|")})\\b`);
        while (lineMatch = lineRegex.exec(text)) {
            if (lineMatch[0].includes('@gq-column') || lineMatch[0].includes('@gq-sub') || lineMatch[0].includes('@gq-struct')) {
                let wordMatch;
                //                 console.log("highlight range lineMatch", lineMatch);
                while (wordMatch = fieldRegex.exec(lineMatch[0])) {
                    let start = lineMatch.index + wordMatch.index;
                    let end = start + wordMatch[1].length;

                    let wordMatchStr = wordMatch[1] as string;
                    //                     console.log("highlight range match", wordMatch[1]);

                    let targetSymbol = this.findGqColumnTargetSymbol(doc, doc.positionAt(start));
                    //                     console.log("highlight targetSymbol", targetSymbol);
                    if (targetSymbol.uri && targetSymbol.symbol) {
                        let targetDocument = await vscode.workspace.openTextDocument(targetSymbol.uri);
                        targetSymbol.symbol.children.forEach((child) => {
                            let tags = targetDocument.getText(child.range);
                            if (tags.includes('gorm:"column:' + wordMatchStr)) {
                                decorations.push({
                                    range: new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
                                });
                            }
                        });
                    }
                };
                fieldRegex.lastIndex = 0;
            }

            let wordMatch;
            while (wordMatch = wordRegex.exec(lineMatch[0])) {
                ////  console.log("wordMatch", index, wordMatch, lineMatch[0], lineMatch);
                // let start = lineMatch.index + lineMatch[0].indexOf(wordMatch[1]);
                let start = lineMatch.index + wordMatch.index;
                let end = start + wordMatch[1].length;



                decorations.push({
                    range: new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
                    // hoverMessage: 'I am a hover!'
                });
            };
            wordRegex.lastIndex = 0;
        };

        const hoverDecorationType = vscode.window.createTextEditorDecorationType({
            color: this.noteHighBrightColor,
        });

        if (this.DecorationsMap.has(uri.toString())) {
            this.DecorationsMap.get(uri.toString())?.dispose();
        }

        this.DecorationsMap.set(uri.toString(), hoverDecorationType);
        editor.setDecorations(hoverDecorationType, decorations);
        //         console.log("结束 highlightComments");
    }

    async watch(context: vscode.ExtensionContext) {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.go');

        watcher.onDidCreate((uri) => {
            if (uri.fsPath.includes('_test.go')) {
                return;
            }
            this.setSymbol(uri);
        });

        watcher.onDidChange((uri) => {
            if (uri.fsPath.includes('_test.go')) {
                return;
            }
            //             console.log("onDidChange", uri.fsPath);
            this.debounceSetSymbol(uri);
        });

        watcher.onDidDelete((uri) => {
            if (uri.fsPath.includes('_test.go')) {
                return;
            }
            this.delSymbol(uri);
        });

        // vscode.workspace.onDidChangeTextDocument((e) => {
        //     this.debounceHighlightComments(vscode.window.activeTextEditor);
        // }, null, context.subscriptions);

        // vscode.workspace.onDidChangeConfiguration((e) => {
        //     this.debounceHighlightComments(vscode.window.activeTextEditor);
        // }, null, context.subscriptions);
        vscode.workspace.onDidChangeTextDocument((e) => {
            //             console.log("onDidChangeTextDocument", e.document.uri.fsPath);
            this.debounceSetSymbol(e.document.uri);
        });



        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.debounceHighlightComments(editor);
            }
        }, null, context.subscriptions);


        context.subscriptions.push(watcher);
    }

    jumpToInterface(context: vscode.ExtensionContext) {
        let that = this;
        let disposable = vscode.commands.registerCommand('mytest.jumpToInterface', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                //                 console.log("uris", that.getEqDirUrisByUri(editor.document.uri));

                let items = that.getEqDirUrisByUri(editor.document.uri).map((uri) => {
                    return that.symbolsMap.get(uri.toString())?.Symbol.map((symbol) => {
                        return { symbol: symbol, uri: uri };
                    }).filter((info) => {
                        if (info.symbol.kind === vscode.SymbolKind.Interface) {
                            //                             console.log("info", info);
                            return true;
                        }
                    });
                }).flat();


                let pickItems = items.filter((item) => {
                    return item !== undefined;
                }).map((item) => {
                    return {
                        label: item?.symbol.name || '',
                        description: item?.symbol.detail || '',
                        detail: '',
                        info: item
                    };
                });
                //                 console.log("pickItems", pickItems);


                if (pickItems) {
                    vscode.window.showQuickPick(pickItems).then(item => {
                        if (item?.info) {
                            vscode.workspace.openTextDocument(item.info.uri).then((doc) => {
                                vscode.window.showTextDocument(doc).then((editor) => {
                                    if (item.info?.symbol.range) {
                                        editor.revealRange(item.info.symbol.range);
                                    }
                                });
                            });
                        };
                    });
                }
            }
        });

        context.subscriptions.push(disposable);
    }

    async findGqColumn(document: vscode.TextDocument, position: vscode.Position, column: string): Promise<vscode.Location | undefined> {
        let targetSymbol = this.findGqColumnTargetSymbol(document, position);
        if (!(targetSymbol.uri && targetSymbol.symbol)) {
            return undefined;
        }

        //         console.log("findGqColumn", targetSymbol.uri, targetSymbol.symbol);


        let targetDocument = await vscode.workspace.openTextDocument(targetSymbol.uri);
        for (let v of targetSymbol.symbol.children) {
            let tags = targetDocument.getText(v.range);
            if (tags.includes('gorm:"column:')) {
                let match = tags.match(/gorm:"column:([^;]+);/);
                //                 console.log("column", column, "match", match);
                if (match && match[1] === column) {
                    return new vscode.Location(targetSymbol.uri, v.range);
                }
            }
        }

        return undefined;
    }

    findGqColumnTargetSymbol(document: vscode.TextDocument, position: vscode.Position): { uri: vscode.Uri | undefined; symbol: vscode.DocumentSymbol | undefined } {
        let currentLine = position.line;
        let gqDoc = "";
        while (currentLine >= 0) {
            currentLine--;
            const line = document.lineAt(currentLine);
            const text = line.text.trim();
            //             console.log("text", text);

            if (text.startsWith('// @gq ')) {
                gqDoc = text.slice('// @gq '.length);
                break;
            }
        }

        //         console.log("gqDoc", gqDoc);

        if (!gqDoc) {
            return { uri: undefined, symbol: undefined };
        }

        let pkgName = "";
        let symbolName = "";
        if (gqDoc.includes('.')) {
            let gqDocSplit = gqDoc.split('.');
            pkgName = gqDocSplit[0];
            symbolName = gqDocSplit[1];
        } else {
            pkgName = this.symbolsMap.get(document.uri.toString())?.PackageName || '';
            symbolName = gqDoc;
        }

        //         console.log("pkgName", pkgName, symbolName);

        return this.getSymbolByPkgNameAndName(pkgName, symbolName);
    }

    gqAutomaticComplement(context: vscode.ExtensionContext) {
        let that = this;
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                { pattern: "**/*.go" },
                {
                    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                        return that.getDocumentSymbols(document.uri).then(async (fileInfo) => {
                            if (!fileInfo) {
                                return undefined;
                            }
                            let targetSymbol = that.findGqColumnTargetSymbol(document, position);
                            if (!(targetSymbol.uri && targetSymbol.symbol)) {
                                return undefined;
                            }



                            let targetDocument = await vscode.workspace.openTextDocument(targetSymbol.uri);
                            let items: vscode.CompletionItem[] = [];

                            targetSymbol.symbol.children?.forEach((child: vscode.DocumentSymbol) => {
                                let tags = targetDocument.getText(child.range);
                                if (tags.includes('gorm:"column:')) {
                                    let match = tags.match(/gorm:"column:([^;]+);/);
                                    if (match && match[1]) {
                                        let item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Field);
                                        let doc = tags.match(/comment:'([^;]+)'/);
                                        item.detail = (doc ? doc[1] : '');
                                        items.push(item);
                                    }
                                }
                            });

                            return items;
                        });
                    }
                },
                ...["// @gq-column ", "// @gq-sub ", "// gq-struct "],
            ));
    }
}
