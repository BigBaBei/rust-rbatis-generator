// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { Parser } from 'sql-ddl-to-json-schema';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  // console.log(
  //   'Congratulations, your extension "rust-rbatis-generator" is now active!'
  // );

  let disposable = vscode.commands.registerCommand(
    "rust-rbatis-generator.generate",
    async(originUri: vscode.Uri) => {
      let uri = originUri
      ? originUri
      : vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
          const err =
              "Please focus on a .rs file .. or just right-click on a .rs file and use the context menu!";
          vscode.window.showErrorMessage(err);
          throw new Error("");
      }

      const rootPath = (await fs.promises.lstat(uri.fsPath)).isDirectory()
      ? uri.fsPath
      : path.dirname(uri.fsPath);
      const rootUri = vscode.Uri.file(rootPath);

      showCreateTableDDLBox(rootUri);
    }
  );

  context.subscriptions.push(disposable);
}


async function fileExists(uri: vscode.Uri): Promise<boolean> {
  return await vscode.workspace.fs
      .stat(uri)
      .then((stat) => (stat.type ? true : false))
      .then(undefined, (isRejected) => !isRejected);
}

async function showCreateTableDDLBox(rootUri: vscode.Uri) {
  const isEnabled = vscode.workspace.getConfiguration().get("rust-rbatis-generator.enable");
  if (!isEnabled) {
    vscode.window.showErrorMessage("Please enable rust-rbatis-generator first!");
    return;
  }

  vscode.window.showInputBox({
    prompt: "Please input your table DDL with semicolon at the end.",
    placeHolder: "CREATE TABLE `user` (`id` int(11) NOT NULL AUTO_INCREMENT,`name` varchar(255) DEFAULT NULL,`age` int(11) DEFAULT NULL,`create_time` datetime DEFAULT NULL,`update_time` datetime DEFAULT NULL,PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
  }).then(async(input) => {
    if (input) {
      
      const rootPath = (await fs.promises.lstat(rootUri.fsPath)).isDirectory()
                    ? rootUri.fsPath
                    : path.dirname(rootUri.fsPath);
      // console.log(vscode.Uri.joinPath(rootUri, input+".rs"));
      if(await fileExists(vscode.Uri.joinPath(rootUri, input+".rs"))){
        const err = `file ${input}.rs already exists!`;
        vscode.window.showErrorMessage(err);
        throw new Error("");
      }

      // 创建一个新的解析器实例
      let parser = new Parser('mysql');
      // 解析DDL
      let jsonSchema = parser.feed(input).toCompactJson();
      if(jsonSchema.length === 0){
        const err = `parse DDL failed!`;
        vscode.window.showErrorMessage(err);
        throw new Error("");
      }
      let fileName = jsonSchema[0].name;
      if(await fileExists(vscode.Uri.joinPath(rootUri, fileName+".rs"))) {
        const err = `file ${fileName}.rs already exists!`;
        vscode.window.showErrorMessage(err);
        throw new Error("");
      }

      let code = "";
      if (jsonSchema[0]?.columns) {
        for (let column of jsonSchema[0].columns) {
          let type = "String";
          switch(column.type.datatype) {
            case "tinyint":
            case "smallint":
            case "int":
              type = "i32";
              break;
            case "varchar":
              type = "String";
              break;
            case "datetime":
            case "timestamp":
              type = "DateTime";
              break;
          }
          code += `    ${column.name}: Option<${type}>,\n`;
        }
      } else {
        const err = `parse DDL failed!`;
        vscode.window.showErrorMessage(err);
        throw new Error("");
      }
      let structName = underlineToCamel(jsonSchema[0].name, true/*upperFirst*/);
      let fileContent = '';
      fileContent += `use rbatis::crud;\n`;
      fileContent += `use rbdc::DateTime;\n`;
      fileContent += `use serde::{Deserialize, Serialize};\n\n`;
      fileContent += `#[derive(Serialize, Deserialize, Clone, Debug)]\n`;
      fileContent += `pub struct ${structName} {\n`;
      fileContent += `${code}\n`;
      fileContent += `}\n\n`;
      fileContent += `crud!(${structName}{});\n`;

      saveFile(jsonSchema[0].name+".rs", fileContent, rootUri);
    }

  });
}

function underlineToCamel(str: string, upperFirst = true) {
  let result = str.replace(/_(\w)/g, function(all, letter) {
    return letter.toUpperCase();
  });

  if (upperFirst) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
}

function showJsonInputBox(fileName: string, rootUri: vscode.Uri) {

  vscode.window.showInputBox({
    prompt: `Please input ${fileName} json content`,
    placeHolder: `{"name":"value"}`,
  }).then(async(input) => {
    if (input) {
      // vscode.window.showInformationMessage(`Hello ${input}`);
      // receive input json and generate rust struct code.
      const json = JSON.parse(input);
      let code = "";
      for (const key in json) {
        if (json.hasOwnProperty(key)) {
          // check type
          let type = "String";
          const value = json[key];
          if (typeof value === "number") {
            type = "i64";
          } else if (typeof value === "boolean") {
            type = "bool";
          }

          code += `${key}: Option<${type}>,\n`;
        }
      }
      const fileContent = `
      use rbatis::crud;
      use rbdc::DateTime;
      use serde::{Deserialize, Serialize};

      #[derive(Serialize, Deserialize, Clone, Debug)]
      pub struct ${fileName} {
        ${code}
      }
      `;
      // save as file in current root path
      saveFile(fileName+".rs", fileContent, rootUri);
    }
  });
}

function saveFile(fileName: string, content: string, rootUri: vscode.Uri) {
  fs.writeFileSync(path.join(rootUri.fsPath, fileName), content);
}

// This method is called when your extension is deactivated
export function deactivate() {}
