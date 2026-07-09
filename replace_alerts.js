const fs = require('fs');

function replaceAlerts(filePath) {
  let code = fs.readFileSync(filePath, 'utf-8');

  if (!code.includes('ErrorModal')) {
    code = code.replace(/import \{ useState/, 'import { useState');
    if (!code.includes('import { ErrorModal }')) {
      code = code.replace(/import React/, "import React");
      code = "import { ErrorModal } from '@/components/ErrorModal';\n" + code;
    }
    
    // insert state
    if (!code.includes('modalError')) {
      code = code.replace(/(const \[loading.*?\] = useState.*?;)/, "$1\n  const [modalError, setModalError] = useState<string | null>(null);");
    }

    // replace alert
    code = code.replace(/alert\((['"`])(.*?)\1\);/g, 'setModalError($1$2$1);');

    // insert modal
    if (!code.includes('<ErrorModal')) {
      code = code.replace(/(<\/[a-zA-Z]+>\s*)$/, "  <ErrorModal error={modalError} onClose={() => setModalError(null)} />\n$1");
    }
    
    fs.writeFileSync(filePath, code);
    console.log('Modified', filePath);
  }
}

replaceAlerts('app/profile/bank/page.tsx');
