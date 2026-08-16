// ==============================================================================
// ghita-codegraph — tree-sitter AST extraction (v1.1.1 Track 8 A10)
// ==============================================================================
// Native replacement for the JS hot path `packages/code-graph/src/ast-parser.ts`
// (TypeScript Compiler API walk). Same output contract:
//   - symbols: function/class/method/interface/type/enum/variable/property
//   - imports: moduleSpecifier + named/default/namespace + line
//   - edges: contains / exports / extends / implements
// The TS wrapper still computes node ids, tags, module nodes and `indexedAt`
// (cheap string work) so graphs are byte-compatible with the JS fallback.
// tree-sitter is error-tolerant: syntax errors yield partial results, never a
// throw (mirrors "fail soft" behavior of the JS walker).
// ==============================================================================

use std::path::Path;

use tree_sitter::{Node, Parser, Tree};

// ---------------------------------------------------------------------------
// Output types (mirror CodeNode/CodeEdge/ImportInfo minus cheap JS-side fields)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymbolKind {
    Module,
    Function,
    Class,
    Method,
    Interface,
    Type,
    Enum,
    Variable,
    Property,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SymbolKind::Module => "module",
            SymbolKind::Function => "function",
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Interface => "interface",
            SymbolKind::Type => "type",
            SymbolKind::Enum => "enum",
            SymbolKind::Variable => "variable",
            SymbolKind::Property => "property",
        }
    }
}

#[derive(Debug, Clone)]
pub struct SymbolInfo {
    pub kind: SymbolKind,
    pub name: String,
    pub qualified_name: String,
    pub start_line: u32,
    pub end_line: u32,
    pub excerpt: String,
    pub exported: bool,
    pub parameters: Vec<String>,
    pub return_type: Option<String>,
    /// Qualified name of the containing class (method/property rows only).
    pub parent: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ImportInfo {
    pub module_specifier: String,
    pub named_imports: Vec<String>,
    pub default_import: Option<String>,
    pub namespace_import: Option<String>,
    pub is_type_only: bool,
    pub line: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeKind {
    Contains,
    Exports,
    Extends,
    Implements,
}

impl EdgeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            EdgeKind::Contains => "contains",
            EdgeKind::Exports => "exports",
            EdgeKind::Extends => "extends",
            EdgeKind::Implements => "implements",
        }
    }
}

#[derive(Debug, Clone)]
pub struct EdgeSpec {
    /// Qualified name of the source symbol (module-relative, no file prefix).
    pub from: String,
    /// Qualified name of the target, or raw identifier text for
    /// extends/implements (mirrors `expr.expression.getText()` in JS).
    pub to: String,
    pub kind: EdgeKind,
    pub weight: f64,
    pub line: u32,
}

#[derive(Debug, Clone)]
pub struct FileParse {
    pub file_path: String,
    pub symbols: Vec<SymbolInfo>,
    pub imports: Vec<ImportInfo>,
    pub edges: Vec<EdgeSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ts,
    Tsx,
    Js,
    Py,
}

pub fn lang_from_path(path: &str) -> Option<Lang> {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("ts") => Some(Lang::Ts),
        Some("tsx") => Some(Lang::Tsx),
        Some("js") | Some("mjs") | Some("cjs") => Some(Lang::Js),
        Some("py") => Some(Lang::Py),
        _ => None,
    }
}

fn language(lang: Lang) -> tree_sitter::Language {
    match lang {
        Lang::Ts => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        Lang::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        Lang::Js => tree_sitter_javascript::LANGUAGE.into(),
        Lang::Py => tree_sitter_python::LANGUAGE.into(),
    }
}

/// Parse one file's source text. Never panics on malformed input — a parse
/// failure yields an empty FileParse (caller falls back to JS).
pub fn parse_file(file_path: &str, content: &str) -> FileParse {
    let Some(lang) = lang_from_path(file_path) else {
        return FileParse {
            file_path: file_path.to_string(),
            symbols: Vec::new(),
            imports: Vec::new(),
            edges: Vec::new(),
        };
    };

    let mut parser = Parser::new();
    if parser.set_language(&language(lang)).is_err() {
        return FileParse {
            file_path: file_path.to_string(),
            symbols: Vec::new(),
            imports: Vec::new(),
            edges: Vec::new(),
        };
    }

    let Some(tree) = parser.parse(content, None) else {
        return FileParse {
            file_path: file_path.to_string(),
            symbols: Vec::new(),
            imports: Vec::new(),
            edges: Vec::new(),
        };
    };

    let mut out = FileParse {
        file_path: file_path.to_string(),
        symbols: Vec::new(),
        imports: Vec::new(),
        edges: Vec::new(),
    };
    let root = tree.root_node();

    match lang {
        Lang::Ts | Lang::Tsx | Lang::Js => walk_tsjs(&tree, root, content, None, false, &mut out),
        Lang::Py => walk_py(&tree, root, content, None, false, &mut out),
    }

    out
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn line_of(node: Node) -> u32 {
    node.start_position().row as u32 + 1
}

fn node_text<'a>(node: Node, content: &'a str) -> &'a str {
    node.utf8_text(content.as_bytes()).unwrap_or("")
}

/// tree-sitter 0.26 `named_children` requires an explicit cursor — collect
/// into a Vec for ergonomic (and borrow-friendly) iteration.
fn named_children(node: Node) -> Vec<Node> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).collect()
}

/// First 200 chars of the node's source, whitespace-collapsed (JS `excerpt`).
fn excerpt(node: Node, content: &str) -> String {
    let text = node_text(node, content);
    let first: String = text.chars().take(200).collect();
    first
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn field_name(node: Node, name: &str, content: &str) -> Option<String> {
    node.child_by_field_name(name)
        .map(|n| node_text(n, content).trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Return-type text. tree-sitter exposes the field as a `type_annotation`
/// node whose source includes the leading ':' — unwrap to the inner type.
fn return_type_text(node: Node, content: &str) -> Option<String> {
    node.child_by_field_name("return_type").and_then(|n| {
        let text = if n.kind() == "type_annotation" {
            n.named_children(&mut n.walk()).into_iter().next()
                .map(|t| node_text(t, content).trim().to_string())
                .unwrap_or_default()
        } else {
            node_text(n, content).trim().to_string()
        };
        (!text.is_empty()).then_some(text)
    })
}

/// Extract parameter names from a `formal_parameters` / `parameters` node.
fn parameter_names(params: Node, content: &str) -> Vec<String> {
    fn walk(n: Node, content: &str, out: &mut Vec<String>) {
        match n.kind() {
            "identifier" => out.push(node_text(n, content).trim().to_string()),
            "required_parameter" | "optional_parameter" | "rest_pattern" => {
                if let Some(name) = n.child_by_field_name("pattern") {
                    out.push(node_text(name, content).trim().to_string());
                }
                // found a name — drop this subtree
            }
            "default_parameter" | "typed_parameter" | "typed_default_parameter" => {
                // python: typed_parameter has no `name` field — first identifier
                // child IS the name (grammar: (typed_parameter (identifier) type: ...)).
                let name = n
                    .child_by_field_name("name")
                    .or_else(|| {
                        n.named_children(&mut n.walk())
                            .into_iter()
                            .find(|c| c.kind() == "identifier")
                    });
                if let Some(name) = name {
                    out.push(node_text(name, content).trim().to_string());
                }
                // drop this subtree — the type/value side may itself be an identifier
            }
            "pattern" | "identifier_pattern" => {
                if let Some(name) = n.child_by_field_name("name") {
                    out.push(node_text(name, content).trim().to_string());
                }
            }
            _ => {
                // pre-order: keeps declaration order
                for child in named_children(n) {
                    walk(child, content, out);
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(params, content, &mut out);
    out
}

#[allow(clippy::too_many_arguments)]
fn push_symbol(
    out: &mut FileParse,
    kind: SymbolKind,
    node: Node,
    content: &str,
    name: String,
    qualified_name: String,
    exported: bool,
    parameters: Vec<String>,
    return_type: Option<String>,
    parent: Option<String>,
) {
    out.symbols.push(SymbolInfo {
        kind,
        name,
        qualified_name,
        start_line: line_of(node),
        end_line: node.end_position().row as u32 + 1,
        excerpt: excerpt(node, content),
        exported,
        parameters,
        return_type,
        parent,
    });
}

fn push_edge(out: &mut FileParse, from: String, to: String, kind: EdgeKind, weight: f64, line: u32) {
    out.edges.push(EdgeSpec {
        from,
        to,
        kind,
        weight,
        line,
    });
}

/// True when the node sits inside an `export_statement` field "declaration",
/// or is exported by an explicit `export` token.
fn is_exported(node: Node, content: &str) -> bool {
    let mut parent = node.parent();
    while let Some(p) = parent {
        match p.kind() {
            "export_statement" => {
                // `export default` / `export {x}` shapes don't carry a node name —
                // only field "declaration" (or a direct declaration child)
                // marks a *named* exported symbol.
                let text = node_text(p, content).trim_start();
                return text.starts_with("export")
                    && (p.child_by_field_name("declaration").is_some()
                        || named_children(p).iter().any(|c| matches!(c.kind(), "function_declaration" | "class_declaration" | "lexical_declaration" | "interface_declaration" | "type_alias_declaration" | "enum_declaration")));
            }
            "export" => return true,
            _ => parent = p.parent(),
        }
    }
    false
}

// ---------------------------------------------------------------------------
// TS / JS walker — kind names shared by tree-sitter-typescript and -javascript
// ---------------------------------------------------------------------------

fn walk_tsjs(
    _tree: &Tree,
    node: Node,
    content: &str,
    parent: Option<String>,
    force_exported: bool,
    out: &mut FileParse,
) {
    let qualified = |name: &str, parent: &Option<String>| match parent {
        Some(p) => format!("{p}.{name}"),
        None => name.to_string(),
    };

    match node.kind() {
        "import_statement" => extract_ts_import(node, content, out),
        "function_declaration" => {
            let Some(name) = field_name(node, "name", content) else {
                // Anonymous (`export default function () {}`) — JS walker does
                // not emit a node but still walks the body.
                for child in named_children(node) {
                    walk_tsjs(_tree, child, content, None, false, out);
                }
                return;
            };
            let qname = qualified(&name, &parent);
            let params = node
                .child_by_field_name("parameters")
                .map(|p| parameter_names(p, content))
                .unwrap_or_default();
            let ret = return_type_text(node, content);
            let exported = force_exported || is_exported(node, content);
            push_symbol(
                out,
                SymbolKind::Function,
                node,
                content,
                name,
                qname.clone(),
                exported,
                params,
                ret,
                None,
            );
            if exported {
                push_edge(out, String::new(), qname, EdgeKind::Exports, 1.0, line_of(node));
            }
            // JS walker recurses into function bodies too (nested defs with
            // no parent) — replicate.
            for child in named_children(node) {
                walk_tsjs(_tree, child, content, None, false, out);
            }
        }
        "lexical_declaration" | "variable_declaration" => {
            // `for (let i = 0; ...)` reuses this node kind, but the JS walker
            // only emits symbols for top-level VariableStatements — skip the
            // for-init shape entirely.
            let in_for = node
                .parent()
                .is_some_and(|p| matches!(p.kind(), "for_statement" | "for_in_statement"));
            if !in_for {
                emit_variable_declarations(node, content, &parent, force_exported, out);
            }
            // JS walker recurses into initializer bodies too (`useEffect(() =>
            // { const x = ... })` yields `x`) — replicate. Nested declarations
            // never inherit the outer export flag.
            for child in named_children(node) {
                walk_tsjs(_tree, child, content, parent.clone(), false, out);
            }
        }
        "class_declaration" | "abstract_class_declaration" => {
            let Some(name) = field_name(node, "name", content) else {
                // Anonymous (`export default class {}`) — walk members without
                // a parent, mirroring the JS walker.
                for member in node
                    .child_by_field_name("body")
                    .map(named_children)
                    .unwrap_or_default()
                {
                    walk_tsjs(_tree, member, content, None, false, out);
                }
                return;
            };
            let qname = qualified(&name, &parent);
            push_symbol(
                out,
                SymbolKind::Class,
                node,
                content,
                name,
                qname.clone(),
                force_exported || is_exported(node, content),
                Vec::new(),
                None,
                None,
            );
            if force_exported || is_exported(node, content) {
                push_edge(out, String::new(), qname.clone(), EdgeKind::Exports, 1.0, line_of(node));
            }
            extract_ts_heritage(node, content, &qname, out);
            for member in node
                .child_by_field_name("body")
                .map(named_children)
                .unwrap_or_default()
            {
                walk_tsjs(_tree, member, content, Some(qname.clone()), false, out);
            }
        }
        "method_definition" => {
            // JS walker ignores constructors / getters / setters (they are not
            // MethodDeclarations) but STILL walks their bodies — nested
            // declarations inside them surface as class-qualified symbols.
            // This grammar renders all three as method_definition — distinguish
            // by source text / name.
            let raw = node_text(node, content).trim_start();
            let is_accessor = raw.starts_with("get ") || raw.starts_with("set ");
            let Some(name) = field_name(node, "name", content) else {
                for child in named_children(node) {
                    walk_tsjs(_tree, child, content, parent.clone(), false, out);
                }
                return;
            };
            if is_accessor || name == "constructor" {
                for child in named_children(node) {
                    walk_tsjs(_tree, child, content, parent.clone(), false, out);
                }
                return;
            }
            let qname = qualified(&name, &parent);
            let params = node
                .child_by_field_name("parameters")
                .map(|p| parameter_names(p, content))
                .unwrap_or_default();
            let ret = return_type_text(node, content);
            push_symbol(
                out,
                SymbolKind::Method,
                node,
                content,
                name,
                qname.clone(),
                false,
                params,
                ret,
                parent.clone(),
            );
            if let Some(p) = &parent {
                push_edge(out, p.clone(), qname, EdgeKind::Contains, 1.0, line_of(node));
            }
        }
        "public_field_definition" | "property_signature" => {
            // JS: class property → `property` node + contains edge (0.8).
            if let Some(name) = field_name(node, "name", content) {
                if parent.is_some() {
                    let qname = qualified(&name, &parent);
                    push_symbol(
                        out,
                        SymbolKind::Property,
                        node,
                        content,
                        name,
                        qname.clone(),
                        false,
                        Vec::new(),
                        None,
                        parent.clone(),
                    );
                    if let Some(p) = &parent {
                        push_edge(out, p.clone(), qname, EdgeKind::Contains, 0.8, line_of(node));
                    }
                }
            }
        }
        "interface_declaration" => {
            if let Some(name) = field_name(node, "name", content) {
                let qname = qualified(&name, &parent);
                push_symbol(
                    out,
                    SymbolKind::Interface,
                    node,
                    content,
                    name,
                    qname.clone(),
                    force_exported || is_exported(node, content),
                    Vec::new(),
                    None,
                    None,
                );
                if force_exported || is_exported(node, content) {
                    push_edge(out, String::new(), qname, EdgeKind::Exports, 1.0, line_of(node));
                }
                // interface members are method/property *signatures* — the JS
                // walker does not emit child nodes for them.
            }
        }
        "type_alias_declaration" => {
            if let Some(name) = field_name(node, "name", content) {
                let qname = qualified(&name, &parent);
                push_symbol(
                    out,
                    SymbolKind::Type,
                    node,
                    content,
                    name,
                    qname.clone(),
                    force_exported || is_exported(node, content),
                    Vec::new(),
                    None,
                    None,
                );
                if force_exported || is_exported(node, content) {
                    push_edge(out, String::new(), qname, EdgeKind::Exports, 1.0, line_of(node));
                }
            }
        }
        "enum_declaration" => {
            if let Some(name) = field_name(node, "name", content) {
                let qname = qualified(&name, &parent);
                push_symbol(
                    out,
                    SymbolKind::Enum,
                    node,
                    content,
                    name,
                    qname.clone(),
                    force_exported || is_exported(node, content),
                    Vec::new(),
                    None,
                    None,
                );
                if force_exported || is_exported(node, content) {
                    push_edge(out, String::new(), qname, EdgeKind::Exports, 1.0, line_of(node));
                }
            }
        }
        "export_statement" => {
            // Recurse into the (exported) declaration; `export {a, b}` clauses
            // introduce no new symbols. `export default function () {}` puts
            // the anonymous function_expression in field "value".
            let decl = node
                .child_by_field_name("declaration")
                .or_else(|| node.child_by_field_name("value"))
                .or_else(|| {
                    named_children(node)
                        .into_iter()
                        .find(|c| {
                            matches!(
                                c.kind(),
                                "function_declaration"
                                    | "class_declaration"
                                    | "lexical_declaration"
                                    | "interface_declaration"
                                    | "type_alias_declaration"
                                    | "enum_declaration"
                                    | "internal_module"
                            )
                        })
                });
            if let Some(d) = decl {
                walk_tsjs(_tree, d, content, parent.clone(), true, out);
            }
        }
        "internal_module" => {
            // `namespace Foo { ... }` — JS walker emits no module node and
            // visits children with no parent.
            for child in named_children(node) {
                walk_tsjs(_tree, child, content, None, false, out);
            }
        }
        _ => {
            // Generic recursion for everything else (function bodies, getters,
            // decorators, if/switch blocks, ...).
            for child in named_children(node) {
                walk_tsjs(_tree, child, content, parent.clone(), force_exported, out);
            }
        }
    }
}

/// Emit symbols for `const/let/var x = ...` declarators (JS semantics):
/// plain identifiers only (destructuring skipped), value required (a bare
/// `let x: T;` produces nothing), and `await foo()` counts as a variable.
#[allow(clippy::too_many_arguments)]
fn emit_variable_declarations(
    node: Node,
    content: &str,
    parent: &Option<String>,
    force_exported: bool,
    out: &mut FileParse,
) {
    let exported = force_exported || is_exported(node, content);
    let qualified = |name: &str, parent: &Option<String>| match parent {
        Some(p) => format!("{p}.{name}"),
        None => name.to_string(),
    };
    for child in named_children(node) {
        if child.kind() != "variable_declarator" {
            continue;
        }
        // Skip destructuring (`const { a } = ...`) — the JS walker only
        // emits nodes for plain identifiers (ts.isIdentifier).
        let Some(name_node) = child.child_by_field_name("name") else {
            continue;
        };
        if name_node.kind() != "identifier" {
            continue;
        }
        let Some(value) = child.child_by_field_name("value") else {
            // `let x: T;` — JS requires a truthy initializer (ts: decl.initializer).
            continue;
        };
        let name = node_text(name_node, content).trim().to_string();
        let qname = qualified(&name, parent);
        // `const x = await foo()`: the grammar exposes the inner
        // call_expression as the value field with `function:
        // (await_expression ...)` — JS treats await calls as plain variables.
        let is_func = {
            let in_await = value.kind() == "call_expression"
                && value
                    .child_by_field_name("function")
                    .is_some_and(|f| f.kind() == "await_expression");
            !in_await
                && matches!(
                    value.kind(),
                    "arrow_function" | "function_expression" | "call_expression"
                )
        };
        if is_func {
            let params = value
                .child_by_field_name("parameters")
                .map(|p| parameter_names(p, content))
                .unwrap_or_default();
            push_symbol(
                out,
                SymbolKind::Function,
                child,
                content,
                name,
                qname.clone(),
                exported,
                params,
                None,
                None,
            );
            if exported {
                push_edge(out, String::new(), qname, EdgeKind::Exports, 1.0, line_of(node));
            }
        } else {
            push_symbol(
                out,
                SymbolKind::Variable,
                child,
                content,
                name,
                qname.clone(),
                exported,
                Vec::new(),
                None,
                None,
            );
            if exported {
                // JS weight for variable exports is 0.8
                push_edge(out, String::new(), qname, EdgeKind::Exports, 0.8, line_of(node));
            }
        }
    }
}


fn extract_ts_import(node: Node, content: &str, out: &mut FileParse) {
    let source = node
        .child_by_field_name("source")
        .map(|s| node_text(s, content).trim().replace(['\'', '"'], ""))
        .unwrap_or_default();
    let text = node_text(node, content).trim_start();
    let is_type_only = text.starts_with("import type") || text.starts_with("import { type ");

    // Grammar note (tree-sitter-typescript 0.23): `import_clause` has no
    // named fields — the default import is its first `identifier` child,
    // `namespace_import` / `named_imports` are kind-based children.
    // Grammar note: `import_clause` is an unnamed (kind-based) child.
    let clause = node
        .named_children(&mut node.walk())
        .into_iter()
        .find(|n| n.kind() == "import_clause");
    let default_import = clause
        .and_then(|c| {
            c.named_children(&mut c.walk())
                .into_iter()
                .find(|n| n.kind() == "identifier")
                .map(|n| node_text(n, content).trim().to_string())
        })
        .filter(|s| !s.is_empty());
    let namespace_import = clause
        .and_then(|c| {
            c.named_children(&mut c.walk())
                .into_iter()
                .find(|n| n.kind() == "namespace_import")
                .map(|n| {
                    n.child_by_field_name("name")
                        .map(|id| node_text(id, content).trim().to_string())
                        .unwrap_or_else(|| {
                            // some grammar versions expose no `name` field —
                            // "* as path" -> "path"
                            node_text(n, content)
                                .trim()
                                .trim_start_matches("* as")
                                .trim()
                                .to_string()
                        })
                })
        })
        .filter(|s| !s.is_empty());

    let mut named_imports: Vec<String> = Vec::new();
    if let Some(named) = clause.and_then(|c| {
        c.named_children(&mut c.walk())
            .into_iter()
            .find(|n| n.kind() == "named_imports")
    }) {
        for spec in named_children(named) {
            // `import { A as B }` -> local name is the `alias` field (matches
            // TS compiler API `ImportSpecifier.name`).
            if let Some(name) = spec
                .child_by_field_name("alias")
                .or_else(|| spec.child_by_field_name("name"))
            {
                named_imports.push(node_text(name, content).trim().to_string());
            }
        }
    }

    out.imports.push(ImportInfo {
        module_specifier: source,
        named_imports,
        default_import,
        namespace_import,
        is_type_only,
        line: line_of(node),
    });
}

fn extract_ts_heritage(node: Node, content: &str, class_qname: &str, out: &mut FileParse) {
    // `class_heritage` is an unnamed (kind-based) child of class_declaration.
    let Some(heritage) = node
        .named_children(&mut node.walk())
        .into_iter()
        .find(|c| c.kind() == "class_heritage")
    else {
        return;
    };
    for clause in named_children(heritage) {
        let line = line_of(clause);
        match clause.kind() {
            "extends_clause" => {
                if let Some(target) = clause.child_by_field_name("value") {
                    let t = node_text(target, content).trim().to_string();
                    if !t.is_empty() {
                        push_edge(out, class_qname.to_string(), t, EdgeKind::Extends, 1.0, line);
                    }
                }
            }
            "implements_clause" => {
                for expr in named_children(clause) {
                    let target = node_text(expr, content).trim().to_string();
                    if !target.is_empty() {
                        push_edge(out, class_qname.to_string(), target, EdgeKind::Implements, 1.0, line);
                    }
                }
            }
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// Python walker
// ---------------------------------------------------------------------------

fn walk_py(
    _tree: &Tree,
    node: Node,
    content: &str,
    parent: Option<String>,
    force_exported: bool,
    out: &mut FileParse,
) {
    let qualified = |name: &str, parent: &Option<String>| match parent {
        Some(p) => format!("{p}.{name}"),
        None => name.to_string(),
    };

    match node.kind() {
        "import_statement" => extract_py_import(node, content, None, out),
        "import_from_statement" => {
            let module = node
                .child_by_field_name("module_name")
                .map(|m| node_text(m, content).trim().to_string())
                .unwrap_or_default();
            extract_py_import(node, content, Some(module), out);
        }
        "function_definition" => {
            if let Some(name) = field_name(node, "name", content) {
                let qname = qualified(&name, &parent);
                let params = node
                    .child_by_field_name("parameters")
                    .map(|p| parameter_names(p, content))
                    .unwrap_or_default();
                let ret = return_type_text(node, content);
                push_symbol(
                    out,
                    SymbolKind::Function,
                    node,
                    content,
                    name,
                    qname.clone(),
                    // Python has no export keyword — top-level symbols are public.
                    force_exported || parent.is_none(),
                    params,
                    ret,
                    parent.clone(),
                );
                if let Some(p) = &parent {
                    push_edge(out, p.clone(), qname, EdgeKind::Contains, 1.0, line_of(node));
                }
                for child in node.child_by_field_name("body").map(named_children).unwrap_or_default() {
                    walk_py(_tree, child, content, None, false, out);
                }
            }
        }
        "class_definition" => {
            if let Some(name) = field_name(node, "name", content) {
                let qname = qualified(&name, &parent);
                push_symbol(
                    out,
                    SymbolKind::Class,
                    node,
                    content,
                    name,
                    qname.clone(),
                    force_exported || parent.is_none(),
                    Vec::new(),
                    None,
                    None,
                );
                if let Some(supers) = node.child_by_field_name("superclasses") {
                    let line = line_of(supers);
                    for expr in named_children(supers) {
                        let target = node_text(expr, content).trim().to_string();
                        if !target.is_empty() && expr.kind() != "argument_list" {
                            push_edge(out, qname.clone(), target, EdgeKind::Extends, 1.0, line);
                        }
                    }
                }
                for child in node.child_by_field_name("body").map(named_children).unwrap_or_default() {
                    walk_py(_tree, child, content, Some(qname.clone()), false, out);
                }
            }
        }
        "decorated_definition" => {
            if let Some(def) = node.child_by_field_name("definition") {
                walk_py(_tree, def, content, parent.clone(), true, out);
            }
        }
        _ => {
            for child in named_children(node) {
                walk_py(_tree, child, content, parent.clone(), force_exported, out);
            }
        }
    }
}

fn collect_py_names(node: Node, content: &str, out: &mut Vec<String>) {
    // Pre-order traversal — keeps declaration order (no stack reversal).
    for n in named_children(node) {
        match n.kind() {
            "dotted_name" => {
                let text = node_text(n, content).trim().to_string();
                if !text.is_empty() {
                    out.push(text);
                }
            }
            "aliased_import" => {
                if let Some(name) = n.child_by_field_name("name") {
                    out.push(node_text(name, content).trim().to_string());
                }
            }
            _ => collect_py_names(n, content, out),
        }
    }
}

fn extract_py_import(node: Node, content: &str, module: Option<String>, out: &mut FileParse) {
    let mut named: Vec<String> = Vec::new();
    collect_py_names(node, content, &mut named);

    let (module_specifier, names): (String, Vec<String>) = match module {
        Some(m) => {
            // `from x import a, b` — the module is not part of `names`.
            let names: Vec<String> = named.into_iter().filter(|n| n != &m).collect();
            (m, names)
        }
        None => (String::new(), named),
    };

    out.imports.push(ImportInfo {
        module_specifier,
        named_imports: names,
        default_import: None,
        namespace_import: None,
        is_type_only: false,
        line: line_of(node),
    });
}

// ---------------------------------------------------------------------------
// Tests — std-only, offline
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(content: &str, path: &str) -> FileParse {
        parse_file(path, content)
    }

    #[test]
    fn extracts_functions_classes_and_exports() {
        let src = r#"
// comment
export function hello(name: string): string {
  return `hi ${name}`;
}
export class Greeter {
  greeting: string;
  greet(name: string) {
    return hello(name);
  }
}
function secret() {}
const arrowFn = (x: number) => x * 2;
export const plain = 42;
export const legacy = () => 1;
"#;
        let out = parse(src, "/abs/path/mod.ts");
        let kinds: Vec<&str> = out.symbols.iter().map(|s| s.kind.as_str()).collect();
        assert!(kinds.contains(&"function"), "functions missing: {kinds:?}");
        assert!(kinds.contains(&"class"), "class missing: {kinds:?}");
        assert!(kinds.contains(&"method"), "method missing: {kinds:?}");
        assert!(kinds.contains(&"property"), "property missing: {kinds:?}");
        assert!(kinds.contains(&"variable"), "variable missing: {kinds:?}");

        let hello = out
            .symbols
            .iter()
            .find(|s| s.name == "hello")
            .expect("hello fn");
        assert!(hello.exported);
        assert_eq!(hello.parameters, vec!["name"]);
        assert_eq!(hello.return_type.as_deref(), Some("string"));

        let greeter = out.symbols.iter().find(|s| s.name == "Greeter").unwrap();
        assert!(greeter.exported);
        let greet = out
            .symbols
            .iter()
            .find(|s| s.name == "greet" && s.kind == SymbolKind::Method)
            .unwrap();
        assert_eq!(greet.parent.as_deref(), Some("Greeter"));
        assert_eq!(greet.qualified_name, "Greeter.greet");

        let arrow = out.symbols.iter().find(|s| s.name == "arrowFn").unwrap();
        assert_eq!(arrow.kind, SymbolKind::Function);
        assert!(!arrow.exported);
        let legacy = out.symbols.iter().find(|s| s.name == "legacy").unwrap();
        assert!(legacy.exported);

        // exports edges: hello (1.0), Greeter (1.0), legacy (1.0 fn).
        // `plain` is not exported — no edge.
        let export_edges: Vec<&EdgeSpec> = out
            .edges
            .iter()
            .filter(|e| e.kind == EdgeKind::Exports)
            .collect();
        assert_eq!(export_edges.len(), 4, "edges: {:?}", export_edges);
        let hello_edge = export_edges.iter().find(|e| e.to == "hello").unwrap();
        assert_eq!(hello_edge.weight, 1.0);
        let legacy_edge = export_edges.iter().find(|e| e.to == "legacy").unwrap();
        assert_eq!(legacy_edge.weight, 1.0);
        let plain_edge = export_edges.iter().find(|e| e.to == "plain").unwrap();
        assert_eq!(plain_edge.weight, 0.8);

        // contains: class → property (0.8) first, class → method (1.0) second
        // (declaration order); `to` is the qualified name the JS wrapper maps
        // to a node id.
        let contains: Vec<&EdgeSpec> = out.edges.iter().filter(|e| e.kind == EdgeKind::Contains).collect();
        assert_eq!(contains.len(), 2);
        assert_eq!(contains[0].from, "Greeter");
        assert_eq!(contains[0].to, "Greeter.greeting");
        assert_eq!(contains[0].weight, 0.8);
        assert_eq!(contains[1].to, "Greeter.greet");
        assert_eq!(contains[1].weight, 1.0);
    }

    #[test]
    fn extracts_imports() {
        let src = r#"
import fs from 'node:fs';
import * as path from 'node:path';
import { readFile, writeFile as write } from 'node:fs/promises';
import type { CodeNode } from './types.js';
import { run } from './util.ts';
"#;
        let out = parse(src, "/abs/path/mod.ts");
        assert_eq!(out.imports.len(), 5);
        let first = &out.imports[0];
        assert_eq!(first.default_import.as_deref(), Some("fs"));
        assert_eq!(first.module_specifier, "node:fs");
        let ns = &out.imports[1];
        assert_eq!(ns.namespace_import.as_deref(), Some("path"));
        let named = &out.imports[2];
        assert_eq!(named.named_imports, vec!["readFile", "write"]);
        assert!(!named.is_type_only);
        let ty = &out.imports[3];
        assert!(ty.is_type_only);
        assert_eq!(ty.named_imports, vec!["CodeNode"]);
    }

    #[test]
    fn handles_extends_and_implements() {
        let src = r#"
interface Animal {}
class Dog extends Base implements Animal, Runnable {
  bark() {}
}
"#;
        let out = parse(src, "/abs/path/dog.ts");
        let extends: Vec<&EdgeSpec> = out.edges.iter().filter(|e| e.kind == EdgeKind::Extends).collect();
        assert_eq!(extends.len(), 1);
        assert_eq!(extends[0].from, "Dog");
        assert_eq!(extends[0].to, "Base");
        let impls: Vec<&EdgeSpec> = out.edges.iter().filter(|e| e.kind == EdgeKind::Implements).collect();
        assert_eq!(impls.len(), 2);
        assert_eq!(impls[0].from, "Dog");
    }

    #[test]
    fn tsx_file_parses_with_tsx_grammar() {
        let src = r#"
export function App(): JSX.Element {
  return <div className="x">hi</div>;
}
"#;
        let out = parse(src, "/abs/path/app.tsx");
        let app = out.symbols.iter().find(|s| s.name == "App").unwrap();
        assert_eq!(app.kind, SymbolKind::Function);
        assert!(app.exported);
    }

    #[test]
    fn python_functions_classes_and_imports() {
        let src = r#"
import os
from pathlib import Path
from typing import Optional, List

def hello(name: str) -> str:
    return f"hi {name}"

class Greeter:
    def greet(self, name: str):
        return hello(name)

def _private():
    pass
"#;
        let out = parse(src, "/abs/path/mod.py");
        assert_eq!(out.imports.len(), 3);
        assert_eq!(out.imports[0].named_imports, vec!["os"]);
        assert_eq!(out.imports[1].module_specifier, "pathlib");
        assert_eq!(out.imports[1].named_imports, vec!["Path"]);
        assert_eq!(out.imports[2].module_specifier, "typing");
        assert_eq!(out.imports[2].named_imports, vec!["Optional", "List"]);

        let hello = out.symbols.iter().find(|s| s.name == "hello").unwrap();
        assert_eq!(hello.kind, SymbolKind::Function);
        assert!(hello.exported, "top-level python def is public");
        assert_eq!(hello.parameters, vec!["name"]);

        let greeter = out.symbols.iter().find(|s| s.name == "Greeter").unwrap();
        assert!(greeter.exported);
        let greet = out.symbols.iter().find(|s| s.name == "greet").unwrap();
        assert_eq!(greet.kind, SymbolKind::Function);
        assert_eq!(greet.parent.as_deref(), Some("Greeter"));
        assert!(!greet.exported, "method is not a top-level export");
    }

    #[test]
    fn malformed_source_does_not_panic() {
        let src = "function broken( {{{{";
        let out = parse(src, "/abs/path/broken.ts");
        // tree-sitter error recovery: may still find the function or not —
        // the contract is: no panic, valid FileParse.
        assert!(out.symbols.len() <= 1);
        let empty = parse("", "/abs/path/empty.py");
        assert!(empty.imports.is_empty());
    }

    #[test]
    fn unsupported_extension_is_empty() {
        let out = parse("fn main() {}", "/abs/path/main.rs");
        assert!(out.symbols.is_empty());
        assert!(out.imports.is_empty());
    }

    #[test]
    fn nested_declarations_inside_constructor_and_accessors() {
        // JS walker: constructors/getters/setters are not MethodDeclarations,
        // so their bodies are still walked — nested consts surface as
        // class-qualified symbols.
        let src = r#"
class A {
  constructor() { const c = 2; }
  get val() { const g = 3; return g; }
  set val2(v: number) { const s = 4; }
  normal() { const n = 5; }
}
"#;
        let out = parse(src, "/abs/path/a.ts");
        // nested consts surface with class-qualified names (JS parity: a
        // variable node has no parentId, but qualifiedName carries the prefix)
        for (name, qname) in [("c", "A.c"), ("g", "A.g"), ("s", "A.s")] {
            assert!(
                out.symbols.iter().any(|s| s.name == name && s.qualified_name == qname),
                "missing nested {name}"
            );
        }
        // A real method emits a method symbol but its body is NOT walked.
        let normal = out.symbols.iter().find(|s| s.name == "normal").unwrap();
        assert_eq!(normal.kind, SymbolKind::Method);
        assert!(!out.symbols.iter().any(|s| s.name == "n"), "method body must not be walked");
        // no constructor/getter/setter symbols
        assert!(!out.symbols.iter().any(|s| s.name == "constructor"));
        assert!(!out.symbols.iter().any(|s| s.name == "val" || s.name == "val2"));
    }

    #[test]
    fn anonymous_default_export_walks_body() {
        // `export default function () { const inner = 1 }` — no symbol for the
        // anonymous function, but the body is still walked.
        let out = parse("export default function() { const inner = 1; }", "/abs/path/x.ts");
        let inner = out.symbols.iter().find(|s| s.name == "inner").expect("inner");
        assert_eq!(inner.kind, SymbolKind::Variable);
        // named default export class still lands as an exported class
        let out2 = parse(
            "export default class Foo { bar() {} }",
            "/abs/path/y.ts",
        );
        let foo = out2.symbols.iter().find(|s| s.name == "Foo").unwrap();
        assert_eq!(foo.kind, SymbolKind::Class);
        assert!(foo.exported);
    }

    #[test]
    fn export_default_anonymous_class_members_walk_without_parent() {
        let out = parse(
            "export default class { run() { const z = 1; } }",
            "/abs/path/z.ts",
        );
        // anonymous class: no class symbol; members walked with no parent.
        let run = out.symbols.iter().find(|s| s.name == "run").expect("run");
        assert_eq!(run.kind, SymbolKind::Method);
        assert_eq!(run.parent, None);
        // method bodies are not walked even for anonymous classes (JS parity)
        assert!(!out.symbols.iter().any(|s| s.name == "z"));
    }
}