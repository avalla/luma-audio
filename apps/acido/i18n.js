/* Interface language only: never part of the audio engine or of saved patterns. Italian text is the key. */
(function(root){
 'use strict';
 const STORE='acido.language';
 const languages={it:'Italiano',en:'English',fr:'Français',de:'Deutsch',es:'Español'};
 const m=(en,fr,de,es)=>({en,fr,de,es});
 const messages={
  'Acido — bassline acida':m('Acido — acid bassline','Acido — basse acide','Acido — Acid-Bassline','Acido — línea de bajo ácida'),
  'bassline monofonica':m('monophonic bassline','basse monophonique','monophone Bassline','bajo monofónico'),
  'Lingua':m('Language','Langue','Sprache','Idioma'),
  '— corrente —':m('— current —','— actuel —','— aktuell —','— actual —'),
  'Suono':m('Sound','Son','Klang','Sonido'),
  "Forma d'onda":m('Waveform',"Forme d'onde",'Wellenform','Forma de onda'),
  'Carattere della distorsione':m('Distortion character','Caractère de la distorsion','Verzerrungscharakter','Carácter de la distorsión'),
  'Pedale':m('Pedal','Pédale','Pedal','Pedal'),
  'tieni premuto, o':m('hold, or','maintenir, ou','halten, oder','mantén pulsado, o'),
  'Pattern (tasti 1-8)':m('Pattern (keys 1-8)','Pattern (touches 1-8)','Pattern (Tasten 1-8)','Patrón (teclas 1-8)'),
  'Copia':m('Copy','Copier','Kopieren','Copiar'),
  'Incolla':m('Paste','Coller','Einfügen','Pegar'),
  'Catena':m('Chain','Chaîne','Kette','Cadena'),
  'es. A A B A':m('e.g. A A B A','ex. A A B A','z. B. A A B A','p. ej. A A B A'),
  'Vuota = ripete il pattern scelto':m('Empty = repeats the selected pattern','Vide = répète le pattern choisi','Leer = wiederholt das gewählte Pattern','Vacía = repite el patrón elegido'),
  'Casuale':m('Random','Aléatoire','Zufall','Aleatorio'),
  'Svuota':m('Clear','Vider','Leeren','Vaciar'),
  'Sposta pattern a sinistra':m('Shift pattern left','Décaler le pattern à gauche','Pattern nach links schieben','Mover patrón a la izquierda'),
  'Sposta pattern a destra':m('Shift pattern right','Décaler le pattern à droite','Pattern nach rechts schieben','Mover patrón a la derecha'),
  'Passi':m('Steps','Pas','Schritte','Pasos'),
  'Note del pattern':m('Pattern notes','Notes du pattern','Pattern-Noten','Notas del patrón'),
  // Help text, split around the <kbd> keys.
  "suonano un'ottava; legato = slide,":m('play one octave; legato = slide,','jouent une octave ; legato = slide,','spielen eine Oktave; Legato = Slide,','tocan una octava; legato = slide,'),
  '= accent,':m('= accent,','= accent,','= Akzent,','= acento,'),
  'ottava. Con il sequencer in play i tasti traspongono il pattern.':m('octave. While the sequencer plays, the keys transpose the pattern.','octave. Quand le séquenceur joue, les touches transposent le pattern.','Oktave. Während der Sequencer läuft, transponieren die Tasten das Pattern.','octava. Con el secuenciador en marcha, las teclas transponen el patrón.'),
  'scelgono il pattern (in play parte a fine giro).':m('select the pattern (during playback it starts at the end of the loop).','choisissent le pattern (en lecture, il démarre à la fin de la boucle).','wählen das Pattern (bei laufender Wiedergabe startet es am Ende des Durchlaufs).','eligen el patrón (en reproducción empieza al final del ciclo).'),
  'tenuto = stutter.':m('held = stutter.','maintenu = stutter.','gehalten = Stutter.','mantenida = stutter.'),
  'Spazio':m('Space','Espace','Leertaste','Espacio'),
  'silenzio. Sui pomelli: trascina in verticale, frecce, doppio clic per il valore iniziale.':m('silence. On knobs: drag vertically, use arrows, double-click for the initial value.','silence. Sur les potentiomètres : glisser verticalement, flèches, double-clic pour la valeur initiale.','Stille. An den Reglern: vertikal ziehen, Pfeiltasten, Doppelklick für den Anfangswert.','silencio. En los mandos: arrastra en vertical, flechas, doble clic para el valor inicial.'),
  // Knob groups and labels.
  'Voce':m('Voice','Voix','Stimme','Voz'),
  'Distorsione':m('Distortion','Distorsion','Verzerrung','Distorsión'),
  'Cassa':m('Kick','Grosse caisse','Kick','Bombo'),
  'Uscita':m('Output','Sortie','Ausgang','Salida'),
  'Coda':m('Tail','Queue','Ausklang','Cola'),
  // Sequencer rows and accessible names.
  'Ott':m('Oct','Oct','Okt','Oct'),
  'C':m('S','C','K','C'),
  'Passo {n}':m('Step {n}','Pas {n}','Schritt {n}','Paso {n}'),
  'ottava su':m('octave up','octave au-dessus','Oktave höher','octava arriba'),
  'ottava giù':m('octave down','octave en dessous','Oktave tiefer','octava abajo'),
  'ottava normale':m('normal octave','octave normale','normale Oktave','octava normal'),
  'gate normale':m('normal gate','gate normal','normales Gate','gate normal'),
  'gate corta':m('short gate','gate court','kurzes Gate','gate corto'),
  'gate lunga':m('long gate','gate long','langes Gate','gate largo'),
  'vuoto':m('empty','vide','leer','vacío'),
  'in riproduzione':m('playing','en lecture','wird abgespielt','en reproducción'),
  'in coda':m('queued','en attente','in Warteschlange','en cola'),
  // Status messages.
  'Audio non disponibile: {error}':m('Audio unavailable: {error}','Audio indisponible : {error}','Audio nicht verfügbar: {error}','Audio no disponible: {error}'),
  'Trasposizione {value}':m('Transpose {value}','Transposition {value}','Transposition {value}','Transposición {value}'),
  'Ottava tastiera {value}':m('Keyboard octave {value}','Octave du clavier {value}','Tastatur-Oktave {value}','Octava del teclado {value}'),
  'Catena: {count} pattern':m('Chain: {count} patterns','Chaîne : {count} patterns','Kette: {count} Pattern','Cadena: {count} patrones'),
  'Catena vuota: ripete il pattern scelto':m('Empty chain: repeats the selected pattern','Chaîne vide : répète le pattern choisi','Leere Kette: wiederholt das gewählte Pattern','Cadena vacía: repite el patrón elegido'),
  'Copiato il pattern {name}':m('Copied pattern {name}','Pattern {name} copié','Pattern {name} kopiert','Patrón {name} copiado'),
  'Incollato in {name}':m('Pasted into {name}','Collé dans {name}','In {name} eingefügt','Pegado en {name}'),
  // Formant, drums, automation, undo, export and share.
  'Formanti':m('Formants','Formants','Formanten','Formantes'),
  'Vocale':m('Vowel','Voyelle','Vokal','Vocal'),
  'vocale':m('vowel','voyelle','Vokal','vocal'),
  'dal pomello':m('from knob','du potentiomètre','vom Regler','del mando'),
  'Percussioni':m('Percussion','Percussions','Percussion','Percusión'),
  'Voc':m('Vow','Voy','Vok','Voc'),
  'Automazione':m('Automation','Automation','Automation','Automatización'),
  'Automazione di {name}':m('{name} automation','Automation de {name}','{name}-Automation','Automatización de {name}'),
  'segue il pomello':m('follows the knob','suit le potentiomètre','folgt dem Regler','sigue el mando'),
  'Cancella':m('Erase','Effacer','Löschen','Borrar'),
  'Rec: muovi Cutoff, Reso, Env Mod o Decay in play':m('Rec: move Cutoff, Reso, Env Mod or Decay during playback','Rec : bougez Cutoff, Reso, Env Mod ou Decay en lecture','Rec: Cutoff, Reso, Env Mod oder Decay bei laufender Wiedergabe bewegen','Rec: mueve Cutoff, Reso, Env Mod o Decay en reproducción'),
  'Annulla':m('Undo','Annuler','Rückgängig','Deshacer'),
  'Ripristina':m('Redo','Rétablir','Wiederholen','Rehacer'),
  'Annullato':m('Undone','Annulé','Rückgängig gemacht','Deshecho'),
  'Ripristinato':m('Redone','Rétabli','Wiederhergestellt','Rehecho'),
  'Esporta WAV':m('Export WAV','Exporter WAV','WAV exportieren','Exportar WAV'),
  'Annulla export':m('Cancel export',"Annuler l'export",'Export abbrechen','Cancelar exportación'),
  'Giri':m('Loops','Boucles','Durchläufe','Ciclos'),
  'Rendering {pct}%':m('Rendering {pct}%','Rendu {pct} %','Rendern {pct} %','Renderizando {pct} %'),
  'WAV pronto':m('WAV ready','WAV prêt','WAV fertig','WAV listo'),
  'Export annullato':m('Export cancelled','Export annulé','Export abgebrochen','Exportación cancelada'),
  'Export troppo lungo (max 10 minuti)':m('Export too long (max 10 minutes)','Export trop long (10 minutes max)','Export zu lang (max. 10 Minuten)','Exportación demasiado larga (máx. 10 minutos)'),
  'Export non riuscito: {error}':m('Export failed: {error}',"Échec de l'export : {error}",'Export fehlgeschlagen: {error}','Error de exportación: {error}'),
  'Condividi':m('Share','Partager','Teilen','Compartir'),
  'Link copiato':m('Link copied','Lien copié','Link kopiert','Enlace copiado'),
  'Copia il link':m('Copy the link','Copiez le lien','Link kopieren','Copia el enlace'),
  'Link non riuscito: {error}':m('Link failed: {error}','Échec du lien : {error}','Link fehlgeschlagen: {error}','Error del enlace: {error}'),
  'Link non valido':m('Invalid link','Lien non valide','Ungültiger Link','Enlace no válido'),
  'Sessione caricata dal link':m('Session loaded from link','Session chargée depuis le lien','Sitzung aus Link geladen','Sesión cargada desde el enlace'),
  'Con Rec attivo, in play, i movimenti di Cutoff, Reso, Env Mod e Decay entrano nel pattern. Nella riga Auto puoi disegnarli; doppio clic cancella un passo. Riga Voc: vocale del filtro a formanti per ogni passo. Cmd/Ctrl+Z annulla, Shift+Cmd/Ctrl+Z ripristina.':m('With Rec on during playback, moves of Cutoff, Reso, Env Mod and Decay go into the pattern. Draw them in the Auto row; double-click erases a step. Vow row: formant filter vowel for each step. Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z redoes.','Avec Rec activé en lecture, les mouvements de Cutoff, Reso, Env Mod et Decay entrent dans le pattern. Dessinez-les dans la ligne Auto ; un double-clic efface un pas. Ligne Voy : voyelle du filtre à formants pour chaque pas. Cmd/Ctrl+Z annule, Maj+Cmd/Ctrl+Z rétablit.','Mit aktivem Rec werden bei laufender Wiedergabe Bewegungen von Cutoff, Reso, Env Mod und Decay ins Pattern geschrieben. In der Auto-Zeile kannst du sie zeichnen; Doppelklick löscht einen Schritt. Vok-Zeile: Vokal des Formantfilters pro Schritt. Cmd/Strg+Z macht rückgängig, Umschalt+Cmd/Strg+Z stellt wieder her.','Con Rec activo en reproducción, los movimientos de Cutoff, Reso, Env Mod y Decay entran en el patrón. Dibújalos en la fila Auto; doble clic borra un paso. Fila Voc: vocal del filtro de formantes en cada paso. Cmd/Ctrl+Z deshace, Mayús+Cmd/Ctrl+Z rehace.'),
  // Bass, banks, song, MIDI import and user presets.
  'Basso':m('Bass','Basse','Bass','Bajo'),
  'Banco':m('Bank','Banque','Bank','Banco'),
  'Banco {n}':m('Bank {n}','Banque {n}','Bank {n}','Banco {n}'),
  'Modifica':m('Edit','Éditer','Bearbeiten','Editar'),
  'Brano':m('Song','Morceau','Song','Canción'),
  'Attivo':m('On','Activé','Aktiv','Activo'),
  'Aggiungi sezione':m('Add section','Ajouter une section','Abschnitt hinzufügen','Añadir sección'),
  'Aggiungi una sezione per costruire intro, break e drop: scegli i pattern, le ripetizioni e le parti da silenziare.':m('Add a section to build intro, break and drop: choose patterns, repeats and which parts to mute.','Ajoutez une section pour construire intro, break et drop : choisissez les patterns, les répétitions et les parties à couper.','Füge einen Abschnitt hinzu, um Intro, Break und Drop zu bauen: Wähle Pattern, Wiederholungen und stummzuschaltende Parts.','Añade una sección para crear intro, break y drop: elige los patrones, las repeticiones y las partes que silenciar.'),
  'Sezione {n}':m('Section {n}','Section {n}','Abschnitt {n}','Sección {n}'),
  'Nome sezione':m('Section name','Nom de la section','Abschnittsname','Nombre de la sección'),
  'Pattern della sezione':m('Section patterns','Patterns de la section','Pattern des Abschnitts','Patrones de la sección'),
  'Ripetizioni':m('Repeats','Répétitions','Wiederholungen','Repeticiones'),
  'Muta {name}':m('Mute {name}','Couper {name}','{name} stummschalten','Silenciar {name}'),
  'Sposta su':m('Move up','Monter','Nach oben','Subir'),
  'Sposta giù':m('Move down','Descendre','Nach unten','Bajar'),
  'Elimina sezione':m('Delete section','Supprimer la section','Abschnitt löschen','Eliminar sección'),
  'Importa MIDI':m('Import MIDI','Importer MIDI','MIDI importieren','Importar MIDI'),
  'Importa':m('Import','Importer','Importieren','Importar'),
  'Chiudi':m('Close','Fermer','Schließen','Cerrar'),
  'Traccia':m('Track','Piste','Spur','Pista'),
  'Tutte':m('All','Toutes','Alle','Todas'),
  'Da battuta':m('From bar','Depuis la mesure','Ab Takt','Desde el compás'),
  'Battute':m('Bars','Mesures','Takte','Compases'),
  'Divisione basso':m('Bass split','Séparation basse','Bass-Split','División del bajo'),
  'Doppio tempo':m('Double time','Double tempo','Doppeltes Tempo','Doble tempo'),
  'Sostituisce i pattern attuali. Puoi tornare indietro con Annulla.':m('Replaces the current patterns. You can go back with Undo.','Remplace les patterns actuels. Vous pouvez revenir en arrière avec Annuler.','Ersetzt die aktuellen Pattern. Mit Rückgängig kannst du zurück.','Sustituye los patrones actuales. Puedes volver atrás con Deshacer.'),
  '{bars} battute, {bpm} BPM':m('{bars} bars, {bpm} BPM','{bars} mesures, {bpm} BPM','{bars} Takte, {bpm} BPM','{bars} compases, {bpm} BPM'),
  '{lead} note melodia, {bass} note basso, {patterns} pattern, {seconds} s':m('{lead} melody notes, {bass} bass notes, {patterns} patterns, {seconds} s','{lead} notes de mélodie, {bass} notes de basse, {patterns} patterns, {seconds} s','{lead} Melodienoten, {bass} Bassnoten, {patterns} Pattern, {seconds} s','{lead} notas de melodía, {bass} notas de bajo, {patterns} patrones, {seconds} s'),
  'Entrano {bars} battute su {total}':m('{bars} of {total} bars fit','{bars} mesures sur {total} tiennent','{bars} von {total} Takten passen','Caben {bars} de {total} compases'),
  'Nessuna nota in queste battute':m('No notes in these bars','Aucune note dans ces mesures','Keine Noten in diesen Takten','No hay notas en estos compases'),
  'File MIDI non valido':m('Invalid MIDI file','Fichier MIDI non valide','Ungültige MIDI-Datei','Archivo MIDI no válido'),
  'MIDI importato: {patterns} pattern':m('MIDI imported: {patterns} patterns','MIDI importé : {patterns} patterns','MIDI importiert: {patterns} Pattern','MIDI importado: {patterns} patrones'),
  'Brani demo':m('Demo songs','Morceaux démo','Demo-Songs','Canciones demo'),
  'Brani con voci':m('Vocal songs','Morceaux vocaux','Songs mit Stimmen','Canciones con voces'),
  'Brani glitch':m('Glitch songs','Morceaux glitch','Glitch-Songs','Canciones glitch'),
  'I miei preset':m('My presets','Mes presets','Meine Presets','Mis presets'),
  'Nome preset':m('Preset name','Nom du preset','Preset-Name','Nombre del preset'),
  'Salva':m('Save','Enregistrer','Speichern','Guardar'),
  'Carica':m('Load','Charger','Laden','Cargar'),
  'Elimina':m('Delete','Supprimer','Löschen','Eliminar'),
  'Nessun preset salvato':m('No saved presets','Aucun preset enregistré','Keine gespeicherten Presets','Ningún preset guardado'),
  'Sovrascrivere "{name}"?':m('Overwrite "{name}"?','Écraser « {name} » ?','"{name}" überschreiben?','¿Sobrescribir "{name}"?'),
  'Eliminare "{name}"?':m('Delete "{name}"?','Supprimer « {name} » ?','"{name}" löschen?','¿Eliminar "{name}"?'),
  'Preset salvato':m('Preset saved','Preset enregistré','Preset gespeichert','Preset guardado'),
  'Preset caricato':m('Preset loaded','Preset chargé','Preset geladen','Preset cargado'),
  'Preset eliminato':m('Preset deleted','Preset supprimé','Preset gelöscht','Preset eliminado'),
  'Spazio esaurito nel browser':m('Browser storage is full','Stockage du navigateur plein','Browserspeicher voll','Almacenamiento del navegador lleno'),
  'Troppi preset (max 50)':m('Too many presets (max 50)','Trop de presets (50 max)','Zu viele Presets (max. 50)','Demasiados presets (máx. 50)'),
  // Preset names: the saved name stays in Italian, only its display changes.
  'Squelch classico':m('Classic squelch','Squelch classique','Klassischer Squelch','Squelch clásico'),
  'Rave gommoso':m('Rubbery rave','Rave caoutchouteux','Gummi-Rave','Rave gomoso'),
  'Quadra profonda':m('Deep square','Carré profond','Tiefes Rechteck','Cuadrada profunda'),
  'Glitch rotto':m('Broken glitch','Glitch cassé','Kaputter Glitch','Glitch roto'),
  'Pedale acido':m('Acid pedal','Pédale acide','Acid-Pedal','Pedal ácido')
 };
 function resolve(value){const code=String(value||'').toLowerCase().split(/[-_]/)[0];return Object.hasOwn(languages,code)?code:'en';}
 function translate(key,lang,params={}){
  const text=lang==='it'?key:messages[key]?.[resolve(lang)]??key;
  return text.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(params,name)?String(params[name]):match);
 }
 function preferred(storage,browser){
  try{const saved=storage?.getItem(STORE);if(saved&&Object.hasOwn(languages,saved))return saved;}catch{}
  return resolve(browser);
 }
 let language='en';
 const nodes=[],attrs=new Map(),texts=new Map(),listeners=new Set();
 const t=(key,params)=>translate(key,language,params);
 function text(el,key,params={}){
  if(typeof el==='string')el=document.getElementById(el);
  if(!el)return;
  texts.set(el,{key,params});el.textContent=t(key,params);
 }
 function attr(el,name,key){
  if(!attrs.has(el))attrs.set(el,new Map());
  attrs.get(el).set(name,key);el.setAttribute(name,t(key));
 }
 function apply(){
  document.documentElement.lang=language;
  for(const [node,key,before,after] of nodes)node.nodeValue=before+t(key)+after;
  for(const [el,map] of attrs)for(const [name,key] of map)el.setAttribute(name,t(key));
  for(const [el,{key,params}] of texts)el.textContent=t(key,params);
  const picker=document.getElementById('language');if(picker)picker.value=language;
 }
 // Binds the static page once; dynamic elements register through text() and attr().
 function mount(){
  let storage;try{storage=root.localStorage;}catch{}
  language=preferred(storage,root.navigator?.language);
  const walk=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walk.nextNode())){
   if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;
   const key=node.nodeValue.trim();
   if(Object.hasOwn(messages,key))nodes.push([node,key,node.nodeValue.match(/^\s*/)[0],node.nodeValue.match(/\s*$/)[0]]);
  }
  for(const name of ['aria-label','placeholder'])for(const el of document.querySelectorAll(`[${name}]`)){
   const key=el.getAttribute(name);if(Object.hasOwn(messages,key))attr(el,name,key);
  }
  apply();
 }
 function setLanguage(value){
  language=resolve(value);
  try{root.localStorage?.setItem(STORE,language);}catch{}
  apply();for(const fn of listeners)fn(language);
 }
 const api={languages,messages,resolve,translate,preferred,t,text,attr,mount,setLanguage,onChange:fn=>listeners.add(fn),get language(){return language;}};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoI18n=api;
})(globalThis);
