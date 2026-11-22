# ACIDO — bassline acida

Prototipo web di un synth basso monofonico nello stile delle bassline acid: oscillatore saw/square, filtro risonante a 4 poli, inviluppo con decay, accent, slide e sequencer a 16 passi. Nessuna build o dipendenza remota.

## Avvio

```sh
bun run dev:acido
```

Aprire <http://127.0.0.1:8767> e premere **Play**. Serve AudioWorklet (localhost o HTTPS).

## Controlli

| Pomello | Effetto |
| --- | --- |
| Tuning | ±12 semitoni |
| Cutoff | frequenza base del filtro, 60 Hz – 5 kHz |
| Reso | risonanza; il feedback è filtrato passa-alto, quindi i bassi restano pieni anche a risonanza alta |
| Env Mod | ampiezza dello sweep dell'inviluppo; abbassa leggermente la base, come sull'originale |
| Decay | decay dell'inviluppo filtro, 200 ms – 2,5 s (le note accentate usano sempre il decay minimo) |
| Accent | volume extra e sweep del filtro accumulato da un "condensatore": accent consecutivi salgono sempre di più |
| Drive | saturazione morbida subito dopo il VCA, per scaldare |
| Dist / Tone / Carattere | distorsione a pedale: quantità (fino a ~36 dB di guadagno), filtro di tono 0,8–12 kHz, curva **Overdrive** (asimmetrica, armoniche pari), **Pedale** (clipping duro a ginocchio cubico), **Fuzz** (raddrizzata, grana all'ottava superiore). A 0 è bypassata esattamente; il livello è compensato |
| Crush | bitcrusher: da 16 a 3 bit e sample rate fino a ÷32 (sample-and-hold). 0 = spento |
| Glitch | probabilità per passo di un evento lungo un passo: **stutter** (50%), **reverse** (25%), **tape stop** (25%). Seed fisso: stessa sequenza, stessi glitch. Con il sequencer fermo gira su un clock interno a tempo |
| Size | fetta dello stutter: 1/16 … 1/256 (le fette piccole diventano un ronzio intonato) |
| Stutter | tieni premuto il pulsante o `Q`: ripete la fetta più recente finché non rilasci |
| Kick / Tune / Coda / Duck | cassa techno sintetizzata in 4/4 a tempo con il sequencer: sinusoide con caduta di pitch rapida, click, saturazione. Livello (0 = spenta), accordatura 40–70 Hz, coda 150–800 ms, **Duck** = sidechain che abbassa il basso (e i suoi echi) sotto ogni colpo. La cassa non passa per delay e glitch. Conta i battiti dal Play, quindi resta dritta anche con pattern di lunghezza dispari |
| Delay / Volume | ping-pong delay su 3/16, livello d'uscita. Il delay è dopo i glitch, quindi ne ripete gli echi |
| Wave | Saw / Square |

Sequencer: clic su una cella per scrivere la nota, clic di nuovo per la pausa. Righe **Ott** (·/UP/DN), **Gate** (· normale 50%, **C** corta 22%, **L** lunga 92% del passo), **Acc**, **Slide**. Uno slide sul passo N tiene il gate fino al passo N+1 e scivola sulla sua altezza (~60 ms) senza riattaccare gli inviluppi. **Casuale** genera un pattern in minore o frigio, ◀ ▶ ruotano il pattern, **Passi** accorcia il giro. Cinque preset di fabbrica ("Squelch classico" ha i pattern A e B e swing 56%, "Pedale acido" usa la distorsione, "Glitch rotto" crush, glitch e fuzz); lo stato si salva automaticamente nel browser e quello della versione precedente diventa il pattern A.

**Pattern A–H** (anche tasti `1`–`8`): il pattern selezionato è quello che modifichi. A sequencer fermo diventa anche quello che parte; in play viene messo in coda (pallino lampeggiante) e parte alla fine del giro corrente. Il pallino fisso indica il pattern in riproduzione; con **Segui** attivo la griglia resta sempre sul pattern che suona. Ogni pattern ha la sua lunghezza. **Copia/Incolla** duplicano un pattern per farne varianti.

**Catena**: scrivi l'ordine, per esempio `A A B A` (fino a 32 voci). Il Play parte dalla prima voce e la catena si ripete; scegliere un pattern mentre suona salta a quella voce a fine giro e la catena prosegue da lì. Vuota = ripete il pattern scelto. Uno slide sull'ultimo passo scivola nel primo passo del pattern successivo.

**Swing** 50–75%: allunga i sedicesimi pari e accorcia i dispari (contati dal Play, non dentro il pattern); ogni coppia resta sulla griglia dritta, quindi non c'è deriva.

Tastiera: `A W S E D F T G Y H U J K` = un'ottava, legato = slide, `Shift` = accent, `Z`/`X` ottava. Con il sequencer in play i tasti traspongono il pattern (stile transpose). `Spazio` play/stop, `Esc` silenzio.

## Produzione

- **Automazione:** con Rec attivo e il sequencer in play, i movimenti di Cutoff, Reso, Env Mod e Decay vengono scritti passo per passo nel pattern. La riga Auto mostra il parametro scelto: si disegna col mouse, doppio clic o Canc cancella un passo, Cancella svuota la corsia. Un passo vuoto segue il pomello.
- **Filtro a formanti:** Formant regola il mix e Vocale sceglie A E I O U. La riga Voc assegna una vocale a ogni passo, con un passaggio morbido tra una e l'altra.
- **Percussioni:** righe Snare (`X` pieno, `g` ghost), Hat (`CH` chiuso, `OH` aperto) e Clap, con i volumi nel gruppo Percussioni.
- **Batteria casuale:** scegli Techno, Rave, Breakbeat, Jungle o Electro e genera il ritmo del pattern. **Su tutti i pattern** lo applica all'intero brano con piccole variazioni; i break senza batteria restano muti.
- **Fill:** rullate automatiche a fine frase. Più alto è il valore, più sono frequenti e lunghe; a 0 la batteria resta esattamente come programmata.
- **Segui:** la griglia mostra il pattern in riproduzione lungo tutto il brano. Scegliere un altro pattern mentre suona un brano disattiva Segui, così puoi modificarlo.
- **Riverbero:** Reverb e Room, su basso e clap. Cassa e hi-hat restano asciutti.
- **Annulla:** pulsanti Annulla e Ripristina, oppure `Cmd/Ctrl+Z` e `Shift+Cmd/Ctrl+Z`. La cronologia dura finché la pagina resta aperta.
- **Esporta WAV:** stereo, 24 bit, 48 kHz, con il numero di giri scelto più 2 secondi di coda (massimo 10 minuti). Viene calcolato in un worker con lo stesso motore del suono dal vivo.
- **Condividi:** copia un link con l'intera sessione. I dati stanno nel frammento `#` dell'URL, che il browser non invia al server.

- **Importa MIDI:** pulsante o trascinamento di un `.mid`. Scegli traccia, battute e divisione: le note più alte diventano il lead, le più basse il basso, i blocchi uguali riusano lo stesso pattern. Il file resta nel browser.
- **Basso:** seconda voce con Bass, Tone e Decay. Con Modifica su Basso la griglia, Ott e Slide agiscono sul basso; l'altra voce resta visibile in trasparenza.
- **Brano:** 32 pattern in 4 banchi (A..H, A2..H4) e fino a 16 sezioni, ognuna con pattern, ripetizioni e parti silenziate. L'export WAV segue il brano.
- **Cassa programmabile:** la riga Kick parte dal 4/4 automatico; il primo clic la rende manuale per quel pattern, `Kick 4/4` la riporta all'automatico.
- **Brani demo:** quindici brani originali nel menu Preset, con arrangiamento completo. Sei melodici o acid (Notte Italiana, Squelch Notturno, Alba Trance, Rave Gomma, Club Profondo, Acido Parlante), cinque cantati dal filtro a formanti nel gruppo Brani con voci (Coro di Mezzanotte, Sirena Lontana, Robot Gentile, Preghiera Trance, Ninna Elettrica) e quattro spezzati nel gruppo Brani glitch (Vetro Rotto, Bit Collasso, Nastro Stanco, Stutter Club).
- **I miei preset:** fino a 50 sessioni salvate con un nome in questo browser.

## Lingue

L'interfaccia è in italiano, inglese, francese, tedesco e spagnolo (`i18n.js`). Al primo avvio segue la lingua del browser, con l'inglese come riserva; la scelta resta salvata nel browser e non entra nei pattern.

## Architettura

- `session.js`: parametri normalizzati 0..1 (diventeranno i parametri del plugin), preset, validazione, generatore casuale deterministico.
- `engine.js`: voce DSP senza DOM e senza allocazioni per campione. PolyBLEP saw/square → ladder 4 poli 2× oversampling con tanh nel feedback e passa-alto nel loop → VCA con accent → drive → distorsione (2× oversampling, curve in crossfade al cambio carattere) → DC block → glitch + crush → delay → soft clip ±0,95.
- `kick.js`: cassa e inviluppo del sidechain, deterministici e preallocati.
- `glitch.js`: buffer circolare di 2,5 s sempre in registrazione, fetta dello stutter copiata in un buffer dedicato (anche uno stutter tenuto a lungo resta intatto), crossfade di 2 ms e declick quando un evento interrompe il precedente; tutto preallocato.
- `sequencer.js`: clock per campione dentro il motore, frazione di campione conservata (nessuna deriva).
- `worklet.js`: adattatore AudioWorklet. `app.js`: UI, tastiera, persistenza.

Il motore è scritto per un porting 1:1 in C++: stessi stati, coefficienti e ordine delle operazioni.

## Verifica

```sh
bun run --filter @luma/acido test
```

Preset a 44,1/48 kHz finiti e limitati, estremi dei parametri, determinismo, timing dei passi senza deriva su 10 s, slide (gate tenuto, nessun retrigger, glide), accent, distorsione (bypass esatto, limiti, armoniche, livello, tono), swing, gate per passo, pattern in coda a fine giro, catena e salto nella catena, slide tra pattern, migrazione dello stato v1, glitch (bypass esatto, determinismo, periodo dello stutter, reverse, rallentamento del tape stop, crush, clock libero), cassa (4/4 dritta con swing e pattern dispari, livello 0 muto, energia sotto 150 Hz, sidechain), panic, validazione/roundtrip.

## Pubblicazione

Online su <https://acido.avalla.dev> (Cloudflare Workers, solo asset statici). Configurazione in `wrangler.jsonc`. Dalla radice del repository:

```sh
bun run deploy:acido
```

Lo staging copia in `build/acido-web` solo i venti file pubblici (niente test né README). L'autenticazione resta nella configurazione locale di Wrangler.

## Prossimi passi

1. Standalone + VST3 + AU con JUCE (`plugins/acido/`), stesso DSP portato in C++, test di confronto con il rendering JS.
2. Nel plugin: sync del sequencer al tempo/trasporto dell'host, oppure suonabile via MIDI (note sovrapposte = slide, velocity alta = accent).
