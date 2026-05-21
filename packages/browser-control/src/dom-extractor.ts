// ==============================================================================
// GHITA CODING AGENT - DOM Accessibility Tree Extractor
// ==============================================================================

export interface InteractiveElement {
  id: string;
  tagName: string;
  role: string;
  text: string;
  placeholder?: string;
  value?: string;
  ariaLabel?: string;
  name?: string;
  href?: string;
  selector: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Extracts visible, interactive elements from a Playwright Page context.
 * Can be run in Node.js where playwright is installed.
 */
export async function extractInteractiveElements(page: any): Promise<InteractiveElement[]> {
  return await page.evaluate(() => {
    const elements: InteractiveElement[] = [];
    
    // Helper to generate a CSS selector for an element
    function getSelector(el: HTMLElement): string {
      if (el.id) {
        return `#${el.id}`;
      }
      
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
      if (testId) {
        return `[data-testid="${testId}"]`;
      }
      
      const role = el.getAttribute('role');
      const name = el.getAttribute('name');
      if (role && name) {
        return `[role="${role}"][name="${name}"]`;
      }
      
      // Fallback: build CSS path
      const path: string[] = [];
      let current: HTMLElement | null = el;
      
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.nodeName.toLowerCase();
        
        if (current.id) {
          selector += `#${current.id}`;
          path.unshift(selector);
          break;
        } else {
          // Add class if present
          if (current.className) {
            const classes = Array.from(current.classList)
              .filter(c => !c.startsWith('hover:') && !c.startsWith('focus:'))
              .join('.');
            if (classes) {
              selector += `.${classes}`;
            }
          }
          
          // Add child index if sibling of same tag exists
          let sibling = current.previousElementSibling;
          let index = 1;
          while (sibling) {
            if (sibling.nodeName === current.nodeName) {
              index++;
            }
            sibling = sibling.previousElementSibling;
          }
          if (index > 1) {
            selector += `:nth-of-type(${index})`;
          }
        }
        
        path.unshift(selector);
        current = current.parentElement;
        
        // Stop if we reach body
        if (current && current.tagName === 'BODY') {
          path.unshift('body');
          break;
        }
      }
      
      return path.join(' > ');
    }

    // Helper to determine if an element is visible
    function isVisible(el: HTMLElement): boolean {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
        return false;
      }
      
      // Check parents visibility
      let parent = el.parentElement;
      while (parent) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
          return false;
        }
        parent = parent.parentElement;
      }
      
      return true;
    }

    // Helper to determine if an element is interactive
    function isInteractive(el: HTMLElement): boolean {
      const tag = el.tagName.toLowerCase();
      
      // Direct form elements
      if (['button', 'input', 'select', 'textarea', 'a', 'details', 'summary'].includes(tag)) {
        return true;
      }
      
      // Elements with tabIndex
      if (el.tabIndex >= 0) {
        return true;
      }
      
      // Interactive ARIA roles
      const role = el.getAttribute('role');
      if (role && ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'combobox', 'option', 'textbox'].includes(role)) {
        return true;
      }
      
      // Inline click handler attributes
      if (el.hasAttribute('onclick') || el.hasAttribute('@click') || el.hasAttribute('v-on:click')) {
        return true;
      }
      
      // Check cursor style
      const style = window.getComputedStyle(el);
      if (style.cursor === 'pointer') {
        return true;
      }
      
      return false;
    }

    const allElements = document.querySelectorAll('*');
    let idCounter = 0;

    for (const node of Array.from(allElements)) {
      const el = node as HTMLElement;
      if (isVisible(el) && isInteractive(el)) {
        const rect = el.getBoundingClientRect();
        
        // Truncate text content
        let text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text.length > 80) {
          text = text.substring(0, 77) + '...';
        }

        const tag = el.tagName.toLowerCase();
        let role = el.getAttribute('role') || '';
        if (!role) {
          if (tag === 'button') role = 'button';
          else if (tag === 'a') role = 'link';
          else if (tag === 'input') {
            const type = el.getAttribute('type') || 'text';
            role = type === 'button' || type === 'submit' ? 'button' : 'textbox';
          } else if (tag === 'textarea') role = 'textbox';
          else if (tag === 'select') role = 'combobox';
          else role = 'element';
        }

        elements.push({
          id: `node-${idCounter++}`,
          tagName: el.tagName,
          role,
          text,
          placeholder: el.getAttribute('placeholder') || undefined,
          value: (el as HTMLInputElement).value || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          name: el.getAttribute('name') || undefined,
          href: el.getAttribute('href') || undefined,
          selector: getSelector(el),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        });
      }
    }

    return elements;
  });
}

/**
 * Format extracted interactive elements into a clean, human-readable text tree representation.
 */
export function formatAccessibilityTree(elements: InteractiveElement[]): string {
  if (elements.length === 0) {
    return 'No interactive elements found on the current page.';
  }
  
  return elements.map(el => {
    const details: string[] = [];
    if (el.placeholder) details.push(`placeholder: "${el.placeholder}"`);
    if (el.value) details.push(`value: "${el.value}"`);
    if (el.ariaLabel) details.push(`aria-label: "${el.ariaLabel}"`);
    if (el.name) details.push(`name: "${el.name}"`);
    if (el.href) details.push(`href: "${el.href}"`);
    
    const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    const textPart = el.text ? ` "${el.text}"` : '';
    
    return `[${el.id}] <${el.role}>${textPart}${detailsStr} rect: [${el.rect.x}, ${el.rect.y}, ${el.rect.width}, ${el.rect.height}] selector: \`${el.selector}\``;
  }).join('\n');
}
