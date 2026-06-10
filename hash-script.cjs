const crypto = require('crypto');
const script = '(function(){var t=localStorage.getItem("qualitrack_theme");var d=false;if(t==="dark"){d=true}else if(t==="system"||!t){d=window.matchMedia(\'(prefers-color-scheme:dark)\').matches}if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light"}})();';
const hash = crypto.createHash('sha256').update(script).digest('base64');
console.log('sha256-' + hash);