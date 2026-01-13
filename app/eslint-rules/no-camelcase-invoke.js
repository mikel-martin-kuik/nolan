/**
 * ESLint rule: no-camelcase-invoke
 *
 * Ensures that Tauri invoke() calls use snake_case parameter keys.
 * The Rust backend uses `#[tauri::command(rename_all = "snake_case")]`.
 *
 * ✅ Allowed: invoke('get_team_config', { team_name: 'default' })
 * ❌ Error:   invoke('get_team_config', { teamName: 'default' })
 *
 * Handles shorthand properties correctly:
 *   { showHidden } → { show_hidden: showHidden }
 */

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Check if a string contains uppercase letters (camelCase indicator)
 */
function isCamelCase(str) {
  return /[A-Z]/.test(str);
}

/**
 * Check if this is an invoke() call
 */
function isInvokeCall(node) {
  if (node.type !== 'CallExpression') return false;

  const callee = node.callee;

  // Direct invoke() call
  if (callee.type === 'Identifier' && callee.name === 'invoke') {
    return true;
  }

  // invokeCommand() call (our typed wrapper)
  if (callee.type === 'Identifier' && callee.name === 'invokeCommand') {
    return true;
  }

  return false;
}

/**
 * Get the parameters object from an invoke call
 * invoke('command', { params }) - second argument
 */
function getParamsObject(node) {
  if (node.arguments.length < 2) return null;

  const secondArg = node.arguments[1];
  if (secondArg.type === 'ObjectExpression') {
    return secondArg;
  }

  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce snake_case parameter keys in Tauri invoke() calls',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      camelCaseKey:
        "Parameter key '{{key}}' uses camelCase. Tauri commands require snake_case: '{{snakeCase}}'",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isInvokeCall(node)) return;

        const paramsObject = getParamsObject(node);
        if (!paramsObject) return;

        // Check each property key
        for (const prop of paramsObject.properties) {
          // Skip spread elements
          if (prop.type === 'SpreadElement') continue;

          // Skip computed properties (dynamic keys)
          if (prop.computed) continue;

          // Get key name
          let keyName;
          if (prop.key.type === 'Identifier') {
            keyName = prop.key.name;
          } else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
            keyName = prop.key.value;
          } else {
            continue;
          }

          // Check for camelCase
          if (isCamelCase(keyName)) {
            const snakeCaseKey = toSnakeCase(keyName);

            context.report({
              node: prop.key,
              messageId: 'camelCaseKey',
              data: {
                key: keyName,
                snakeCase: snakeCaseKey,
              },
              fix(fixer) {
                // Check if this is a shorthand property: { foo } instead of { foo: value }
                const isShorthand = prop.shorthand === true;

                if (isShorthand) {
                  // For shorthand { showHidden }, convert to { show_hidden: showHidden }
                  // We need to replace the entire property, not just the key
                  const originalVarName = keyName;
                  return fixer.replaceText(prop, `${snakeCaseKey}: ${originalVarName}`);
                } else {
                  // For explicit { showHidden: value }, just replace the key
                  if (prop.key.type === 'Identifier') {
                    return fixer.replaceText(prop.key, snakeCaseKey);
                  } else if (prop.key.type === 'Literal') {
                    return fixer.replaceText(prop.key, `'${snakeCaseKey}'`);
                  }
                }
                return null;
              },
            });
          }
        }
      },
    };
  },
};

export default rule;
