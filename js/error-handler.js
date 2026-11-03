addEventListener('error',function(e){var p=document.getElementById('pad');if(p)p.textContent='ERROR: '+e.message+' ('+String(e.filename||'').split('/').pop()+':'+e.lineno+')'})
