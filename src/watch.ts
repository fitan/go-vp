import * as vscode from 'vscode';
import * as path from 'path';
import { workerData } from 'worker_threads';

const trimBracketsRegex = /\(.+?\)$/g;

// 定义一个包括点的单词模式
const wordPattern = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:'"\,\<\>\/\?\s]+)/g;


interface FileInfo {
    Symbol: vscode.SymbolInformation[];
    PackageName: string;
    Imports: string[];
    PathDir: string;
}


export class SymbolInfo {
    async initialize() {
        this.moduleName = await this.getGoModuleName() || '';
    }

    moduleName: string = '';
    symbolsMap: Map<vscode.Uri, FileInfo> = new Map();
    DecorationsMap: Map<vscode.Uri, vscode.TextEditorDecorationType> = new Map();
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
        return this.symbolsMap.get(uri);
    }

    async setSymbol(uri: vscode.Uri) {
        let symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        );

        let info: FileInfo = {
            Symbol: symbols || [],
            PackageName: await this.getPackageName(uri),
            Imports: this.getAndCheckImports(uri),
            PathDir: path.dirname(uri.fsPath)
        };

        this.symbolsMap.set(uri, info);
        this.index.get(`packageName#${info.PackageName}`)?.add(uri) || this.index.set(`packageName#${info.PackageName}`, new Set([uri]));
        this.index.get(`pathDir#${info.PathDir}`)?.add(uri) || this.index.set(`pathDir#${info.PathDir}`, new Set([uri]));
    }

    async delSymbol(uri: vscode.Uri) {
        this.symbolsMap.delete(uri);
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
        // console.log('Project specific imports:', projectImports);
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
            let fileInfo = this.symbolsMap.get(uri);
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

    getSymbolByPkgNameAndName(pkgName: string, name: string): vscode.SymbolInformation | undefined {
        let indexs = this.index.get(`packageName#${pkgName}`);
        if (indexs) {
            for (let uri of indexs) {
                let fileInfo = this.symbolsMap.get(uri);
                if (fileInfo) {
                    for (let symbol of fileInfo.Symbol) {
                        if (symbol.name === name) {
                            return symbol;
                        }
                    }
                }
            }
        }
    }


    checkWordEqSymbolNameByUriAndWords(uri: vscode.Uri, words: string[]): string[] {
        let res: string[] = [];
        this.index.get(`pathDir#${path.dirname(uri.fsPath)}`)?.forEach((uri) => {
            let fileInfo = this.symbolsMap.get(uri);
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

    getSymbolBySourceUriAndName(uri: vscode.Uri, name: string): vscode.SymbolInformation | undefined {
        let s: vscode.SymbolInformation | undefined = undefined;
        this.index.get(`pathDir#${path.dirname(uri.fsPath)}`)?.forEach((uri) => {
            let fileInfo = this.symbolsMap.get(uri);
            if (fileInfo) {
                fileInfo.Symbol.find((symbol) => {
                    if (symbol.name === name) {
                        s = symbol;
                    }
                });
            }
        });
        return s;
    }

    getEqDirUrisByUri(uri: vscode.Uri): vscode.Uri[] {
        let uris: vscode.Uri[] = [];
        for (let [key, value] of this.symbolsMap) {
            if (path.dirname(key.fsPath) === path.dirname(uri.fsPath)) {
                uris.push(key);
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
                    let word = document.getText(document.getWordRangeAtPosition(position, wordPattern));
                    word = word.includes('(') ? word.replace(trimBracketsRegex, '') : word;
                    let symbol: vscode.SymbolInformation | undefined = undefined;
                    if (word.includes('.')) {
                        let wordSplit = word.split('.');
                        symbol = that.getSymbolByPkgNameAndName(wordSplit[0], wordSplit[1]);
                    } else {
                        symbol = that.getSymbolBySourceUriAndName(document.uri, word);
                    }

                    if (symbol) {
                        return new vscode.Location(symbol.location.uri, symbol.location.range);
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
            context.debounceArgsMap(uri.fsPath, timeout);
        };

    };

    async highlightComments(editor: vscode.TextEditor) {
        const uri = editor.document.uri;
        const text = editor.document.getText();
        const doc = editor.document;
        const comments = text.match(/\/\/ .*/g);
        let wordNumMap: Map<string, number> = new Map();
        if (comments) {
            comments.forEach((comment) => {
                wordNumMap.set(comment, 0);
            });
        }

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
            console.log("words", words);
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

            let checkedWords = checkedLocalWords.concat(checkedPkgWords);

            console.log("checkedWords", checkedWords);

            const lineRegex = new RegExp(`\\/\\/ .*`, 'g');

            const wordRegex = new RegExp(`\\b(${checkedWords.join("|")})\\b`, 'g');


            let decorations: vscode.DecorationOptions[] = [];
            let lineMatch;
            while (lineMatch = lineRegex.exec(text)) {
                let wordMatch;
                while (wordMatch = wordRegex.exec(lineMatch[0])) {
                    console.log("wordMatch", wordMatch);
                    // let start = lineMatch.index + lineMatch[0].indexOf(wordMatch[1]);
                    let start = lineMatch.index + wordMatch.index;
                    let end = start + wordMatch[1].length;


                    decorations.push({
                        range: new vscode.Range(doc.positionAt(start), doc.positionAt(end)),
                        // hoverMessage: 'I am a hover!'
                    });
                };
            };

            const hoverDecorationType = vscode.window.createTextEditorDecorationType({
                color: this.noteHighBrightColor,
            });

            if (this.DecorationsMap.has(uri)) {
                this.DecorationsMap.get(uri)?.dispose();
            }

            this.DecorationsMap.set(uri, hoverDecorationType);
            editor.setDecorations(hoverDecorationType, decorations);
            console.log("结束 highlightComments");
        }
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
            console.log("onDidChange", uri.fsPath);
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
            console.log("onDidChangeTextDocument", e.document.uri.fsPath);
            this.debounceSetSymbol(e.document.uri);
        });



        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.debounceHighlightComments(editor);
            }
        }, null, context.subscriptions);


        context.subscriptions.push(watcher);
    }
}
