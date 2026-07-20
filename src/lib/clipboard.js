export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.focus();
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}
