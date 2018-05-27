const vscode = require("vscode");
const process = require("process");
const fs = require("fs");
const path = require("path");
const os = require("os");

var singleComment = 1;
var multiComment = 2;

function stripWithoutWhitespace() {
  return "";
}

function stripWithWhitespace(str, start, end) {
  return str.slice(start, end).replace(/\S/g, " ");
}

function stripJSONComments(str, opts) {
  opts = opts || {};

  var currentChar;
  var nextChar;
  var insideString = false;
  var insideComment = false;
  var offset = 0;
  var ret = "";
  var strip =
    opts.whitespace === false ? stripWithoutWhitespace : stripWithWhitespace;

  for (var i = 0; i < str.length; i++) {
    currentChar = str[i];
    nextChar = str[i + 1];

    if (!insideComment && currentChar === '"') {
      var escaped = str[i - 1] === "\\" && str[i - 2] !== "\\";
      if (!escaped) {
        insideString = !insideString;
      }
    }

    if (insideString) {
      continue;
    }

    if (!insideComment && currentChar + nextChar === "//") {
      ret += str.slice(offset, i);
      offset = i;
      insideComment = singleComment;
      i++;
    } else if (
      insideComment === singleComment &&
      currentChar + nextChar === "\r\n"
    ) {
      i++;
      insideComment = false;
      ret += strip(str, offset, i);
      offset = i;
      continue;
    } else if (insideComment === singleComment && currentChar === "\n") {
      insideComment = false;
      ret += strip(str, offset, i);
      offset = i;
    } else if (!insideComment && currentChar + nextChar === "/*") {
      ret += str.slice(offset, i);
      offset = i;
      insideComment = multiComment;
      i++;
      continue;
    } else if (
      insideComment === multiComment &&
      currentChar + nextChar === "*/"
    ) {
      i++;
      insideComment = false;
      ret += strip(str, offset, i + 1);
      offset = i + 1;
      continue;
    }
  }

  return ret + (insideComment ? strip(str.substr(offset)) : str.substr(offset));
}

function activate(context) {
  var disposable = vscode.commands.registerCommand(
    "extension.createSnippet",
    () => {
      var editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("There is no text editor.");
        return;
      }

      var selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage(
          "Cannot create snippet from empty string. Select some text first."
        );
        return;
      }

      var selectedText = editor.document.getText(selection);

      let snippetObject = {};
      vscode.languages
        .getLanguages()
        .then(vsCodeLangs => {
          return vscode.window.showQuickPick(vsCodeLangs, {
            placeHolder: vscode.window.activeTextEditor.document.languageId
          });
        })
        .then(language => {
          snippetObject.language = language;

          return vscode.window.showInputBox({
            prompt: "Enter snippet name"
          });
        })
        .then(name => {
          if (name === undefined) {
            return Promise.reject("Name was undefined");
          }
          snippetObject.name = name;

          return vscode.window.showInputBox({
            prompt: "Enter snippet shortcut"
          });
        })
        .then(shortcut => {
          if (shortcut === undefined) {
            return Promise.reject("Shortcut was undefined");
          }
          snippetObject.shortcut = shortcut;

          return vscode.window.showInputBox({
            prompt: "Enter snippet description"
          });
        })
        .then(description => {
          if (description === undefined) {
            return Promise.reject("Description was undefined");
          }
          snippetObject.description = description;

          return Promise.resolve();
        })
        .then(() => {
          const userSnippetsFilePath = path.join(
            getVsCodeUserSettingsPath(),
            "snippets",
            snippetObject.language + ".json"
          );

          fs.readFile(userSnippetsFilePath, (err, text) => {
            if (err) {
              fs.open(userSnippetsFilePath, "w+", (err, _) => {
                if (err) {
                  vscode.window.showErrorMessage(
                    "Could not open file for writing.",
                    err,
                    userSnippetsFilePath
                  );
                  return;
                }

                var snippets = {};

                addSnippet(snippets, snippetObject, selectedText);
                writeSnippetsToFile(
                  snippets,
                  userSnippetsFilePath,
                  snippetObject
                );
                return;
              });

              vscode.window.showInformationMessage(
                "Created new snippet with shortcut: " + snippetObject.shortcut
              );
              return;
            }

            var snippets = JSON.parse(text.toString());

            if (snippets[snippetObject.name] !== undefined) {
              vscode.window.showErrorMessage(
                "Snippet with this name already exists.",
                snippetObject.name
              );
              return;
            }

            addSnippet(snippets, snippetObject, selectedText);
            writeSnippetsToFile(snippets, userSnippetsFilePath, snippetObject);
          });
        });
    }
  );

  context.subscriptions.push(disposable);
}
exports.activate = activate;

function addSnippet(snippets, snippetObject, selectedText) {
  snippets[snippetObject.name] = {
    prefix: snippetObject.shortcut,
    body: buildBodyFromText(selectedText),
    description: snippetObject.description
  };
}

function writeSnippetsToFile(snippets, userSnippetsFilePath, snippetObject) {
  var newText = JSON.stringify(snippets, null, "\t");
  fs.writeFile(userSnippetsFilePath, newText, err => {
    if (err) {
      vscode.window.showErrorMessage(
        "Could not write to file.",
        err,
        userSnippetsFilePath
      );
      return;
    }
    vscode.window.showInformationMessage(
      "Created a new snippet. You can use it now by typing: " +
        snippetObject.shortcut
    );
  });
}

function getVsCodeUserSettingsPath() {
  switch (os.type()) {
    case "Darwin": {
      return process.env.HOME + "/Library/Application Support/Code/User/";
    }
    case "Linux": {
      return process.env.HOME + "/.config/Code/User/";
    }
    case "Windows_NT": {
      return process.env.APPDATA + "\\Code\\User\\";
    }
    default: {
      //BSD?
      return process.env.HOME + "/.config/Code/User/";
    }
  }
}

function buildBodyFromText(text) {
  text += "\n$0";
  return text.split("\n");
}

function deactivate() {}
exports.deactivate = deactivate;
