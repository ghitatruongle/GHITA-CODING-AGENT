const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'apps/mobile/src/screens/PairingScreen.tsx',
  'apps/mobile/src/screens/RemoteControlScreen.tsx',
  'apps/mobile/src/components/ChatInput.tsx',
  'apps/mobile/src/components/ConnectionStatus.tsx',
  'apps/mobile/src/components/ErrorFallback.tsx',
  'apps/mobile/src/components/QuickActions.tsx',
  'apps/mobile/src/components/ScreenPreview.tsx'
];

filesToUpdate.forEach(filePath => {
  const fullPath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // 1. Replace import { Colors } with Theme Context
  if (content.includes("import { Colors } from '../theme/colors';")) {
    content = content.replace(
      "import { Colors } from '../theme/colors';",
      "import { ThemeColors } from '../theme/colors';\nimport { useTheme } from '../theme/ThemeContext';"
    );
  }

  // 2. Add hook usage at the top of the component
  const funcRegex = /export\s+(?:default\s+)?function\s+([A-Z][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?::\s*React\.JSX\.Element)?\s*\{/;
  const match = content.match(funcRegex);
  if (match && !content.includes("useTheme()")) {
    const insertPos = match.index + match[0].length;
    const hookCode = "\n  const { colors } = useTheme();\n  const styles = React.useMemo(() => createStyles(colors), [colors]);";
    content = content.slice(0, insertPos) + hookCode + content.slice(insertPos);
  }

  // 3. Replace all Colors.xxx with colors.xxx in the render body
  content = content.replace(/Colors\./g, 'colors.');

  // 4. Change const styles = StyleSheet.create(...) to const createStyles = (colors: ThemeColors) => StyleSheet.create(...)
  if (content.includes('const styles = StyleSheet.create({')) {
    content = content.replace(
      'const styles = StyleSheet.create({',
      'const createStyles = (colors: ThemeColors) => StyleSheet.create({'
    );
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated ${filePath}`);
});
