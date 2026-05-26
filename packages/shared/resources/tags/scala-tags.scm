; Definitions

(package_clause
  name: (package_identifier) @name.definition.module) @definition.module

(trait_definition
  name: (identifier) @name.definition.interface) @definition.interface

(class_definition
  name: (identifier) @name.definition.class) @definition.class

(object_definition
  name: (identifier) @name.definition.object) @definition.object

(function_definition
  name: (identifier) @name.definition.function) @definition.function

(val_definition
  pattern: (identifier) @name.definition.variable) @definition.variable

(var_definition
  pattern: (identifier) @name.definition.variable) @definition.variable

(val_declaration
  name: (identifier) @name.definition.variable) @definition.variable

(var_declaration
  name: (identifier) @name.definition.variable) @definition.variable

(type_definition
  name: (type_identifier) @name.definition.type) @definition.type

(class_parameter
  name: (identifier) @name.definition.property) @definition.property

; References

(call_expression
  (identifier) @name.reference.call) @reference.call

(extends_clause
  (type_identifier) @name.reference.class) @reference.class

(extends_clause
  (generic_type
    (type_identifier) @name.reference.class)) @reference.class
