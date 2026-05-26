; ==============================================================================
; Pascal Tree-sitter Tag Queries
; ==============================================================================

; Definitions

(unit
  (unit_head
    name: (identifier) @name.definition.module)) @definition.module

(procedure_heading
  name: (identifier) @name.definition.function) @definition.function

(function_heading
  name: (identifier) @name.definition.function) @definition.function

(type_declaration
  name: (identifier) @name.definition.type) @definition.type

(class_type
  (type_section
    (class_field
      name: (identifier) @name.definition.field))) @definition.field

(var_declaration
  (identifier_list
    (identifier) @name.definition.variable)) @definition.variable

(procedure_definition_section
  (procedure_definition
    (procedure_heading
      name: (identifier) @name.definition.function))) @definition.function

(function_definition_section
  (function_definition
    (function_heading
      name: (identifier) @name.definition.function))) @definition.function

; References

(call_expression
  (identifier) @name.reference.call) @reference.call
