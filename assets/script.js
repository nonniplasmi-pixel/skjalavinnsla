// Allur virkni-kóði færður hingað úr index.html
window.addEventListener('load', () => {
  try {
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
    }
  } catch (e) {}

  const $ = (id) => document.getElementById(id);
  const setValue = (id, v) => $(id).value = v || "";
  const getValue = (id) => (($(id).value) || "").trim();

  function refreshSummary(p) {
    const s = $('summary');
    s.textContent = [
      p.sellerName ? `Seljandi: ${p.sellerName}` : "Seljandi: ?",
      p.buyerName  ? `Kaupandi: ${p.buyerName}`  : "Kaupandi: ?",
      p.address    ? `Eign: ${p.address}` : "Eign: ?",
      p.price      ? `Kaupverð: ${p.price}` : "Kaupverð: ?",
    ].join("\n");
  }

  function checklist() {
    const items = [];
    if (!getValue('sellerName') || !getValue('sellerSSN')) items.push({t:"Vantar fullar upplýsingar um seljanda (nafn/kt.)", s:"err"});
    if (!getValue('buyerName') || !getValue('buyerSSN'))   items.push({t:"Vantar fullar upplýsingar um kaupanda (nafn/kt.)", s:"err"});
    if (!getValue('propertyAddress')) items.push({t:"Vantar heimilisfang eignar", s:"err"});
    if (!getValue('price')) items.push({t:"Vantar kaupverð", s:"err"});
    if (!getValue('handover')) items.push({t:"Vantar afhendingardag", s:"warn"});

    const hasLoan = $('hasLoan').checked, hasChain = $('hasChain').checked, hasLandLease = $('hasLandLease').checked;
    if (hasLoan)      items.push({t:"Lán á eign: biðja um lánayfirlit, veðbókarvottorð og uppgreiðsluáætlun", s:"warn"});
    if (hasChain)     items.push({t:"Tvær eða fleiri eignir: velja veðflutning eða uppgreiðslu á hverri eign", s:"warn"});
    if (hasLandLease) items.push({t:"Lóðarleiga: hlaða inn lóðarleigusamningi og skuldleysisstaðfestingu leigusala", s:"warn"});

    const cond = getValue('conditions').toLowerCase();
    if (cond.includes('veð') || cond.includes('ved')) items.push({t:"Skilyrt veðleyfi nefnt: stofna veðleyfis-/veðflutningsbeiðni og stöðva útgreiðslur þar til samþykkt liggur fyrir", s:"warn"});
    if (cond.includes('fjármögn') || cond.includes('fjarmogn')) items.push({t:"Fjármögnunar-fyrirvari: merkja sem skilyrði og fylgja gildistíma", s:"warn"});
    if (cond.includes('skoðun')) items.push({t:"Skoðunarfyrirvari: skrá frest og verklag við úrbætur/niðurlagningu", s:"ok"});

    const el = $('checklist'); el.innerHTML = "";
    if (items.length === 0) el.innerHTML = '<div class="badge ok inline-block">[OK] Engar athugasemdir</div>';
    else items.forEach(it => { const d = document.createElement('div'); d.className = `badge inline-block ${it.s}`; d.textContent = it.t; el.appendChild(d); });

    const json = {
      parties: {
        seller: { name: getValue('sellerName'), ssn: getValue('sellerSSN') },
        buyer:  { name: getValue('buyerName'),  ssn: getValue('buyerSSN') }
      },
      property: { address: getValue('propertyAddress'), id: getValue('propertyId') },
      price: { total: getValue('price'), deposit: getValue('deposit') },
      dates: { handover: getValue('handover'), deed_issue: getValue('deedIssueDate') },
      flags: { hasLoan, hasChain, hasLandLease },
      contingencies: {
        seller: getValue('sellerContingencies'),
        buyer:  getValue('buyerContingencies'),
        combined: getValue('conditions')
      },
      checklist: items.map(i => i.t)
    };
    $('jsonOut').value = JSON.stringify(json, null, 2);
  }

  function parseFields(rawText) {
    const txt = (rawText || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\u00A0/g, " ")
      .trim();

    const lines = txt.split(/\n+/);

    function nextLineAfter(labelRegex) {
      for (let i = 0; i < lines.length; i++) {
        if (labelRegex.test(lines[i])) {
          const sameLine = lines[i].replace(/\s+/g, " ").trim();
          const mSame = sameLine.match(/:\s*(.+)$/);
          if (mSame && mSame[1]) return mSame[1].trim();
          for (let j = i + 1; j < lines.length; j++) {
            const val = lines[j].trim();
            if (val) return val;
          }
        }
      }
      return "";
    }

    function sectionAfter(labelRegex, maxLines = 12) {
      for (let i = 0; i < lines.length; i++) {
        if (labelRegex.test(lines[i])) {
          const out = [];
          for (let j = i + 1; j < Math.min(lines.length, i + 1 + maxLines); j++) {
            const val = lines[j].trim();
            if (!val) break;
            out.push(val);
          }
          return out.join("\n");
        }
      }
      return "";
    }

    function splitNameAndSSN(line) {
      const ssnMatch = line.match(/\b(\d{6}[- ]?\d{4})\b/);
      const ssn = ssnMatch ? ssnMatch[1].replace(" ", "-") : "";
      const name = ssnMatch ? line.slice(0, ssnMatch.index).trim() : line.trim();
      return { name: name.replace(/[,\s]+$/,""), ssn };
    }

    let sellerLine = nextLineAfter(/^\s*Seljandi(\s+Kennitala.*)?\s*$/i);
    let seller = splitNameAndSSN(sellerLine);

    let buyerLine = nextLineAfter(/^\s*Kaupandi(\s+Kennitala.*)?\s*$/i);
    let buyer = splitNameAndSSN(buyerLine);
    const buyerIdx = lines.findIndex(l => /^\s*Kaupandi(\s+Kennitala.*)?\s*$/i.test(l));
    if (buyerIdx >= 0) {
      const maybeNames = (lines[buyerIdx+1] || "").replace(/\b\d{6}[- ]?\d{4}\b/g,"").replace(/\s{2,}/g," ").trim();
      if (maybeNames) buyerLine = maybeNames;
    }
    const buyerNames = buyerLine
      .replace(/\b\d{6}[- ]?\d{4}\b/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[,\s]+$/,"")
      .trim();

    let priceLine = nextLineAfter(/Kaupver[ðd](\s+í\s+tölustöfum)?/i);
    let price = (priceLine.match(/[\d\. ]+(?:\s*kr\.?|\skr\.?)?/i) || [""])[0]
      .replace(/\s+kr\.?/i, " kr.")
      .replace(/\s+/g, " ")
      .trim();

    let depositLine = nextLineAfter(/(Trygging|Útborgun)/i);
    let deposit = (depositLine.match(/[\d\. ]+(?:\s*kr\.?|\skr\.?)?/i) || [""])[0]
      .replace(/\s+kr\.?/i, " kr.")
      .replace(/\s+/g, " ")
      .trim();

    let handover = nextLineAfter(/Afhending(ardagur)?/i) || nextLineAfter(/Afhending/i);

    let deedIssueDate = nextLineAfter(/Útgáfudagur\s+afsals/i);
    if (!deedIssueDate) {
      const payPlan = sectionAfter(/Greiðslutilhögun/i, 12);
      const m = payPlan.match(/(Afsal|útgáf[ua]\s+afsals).*?(\d{1,2}\.\d{1,2}\.\d{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|við\s+uppgjör|við\s+afsal)/i);
      deedIssueDate = m ? m[2] : "";
    }

    const sellerCont = nextLineAfter(/Fyrirvarar\s+seljanda/i) || "";
    const buyerCont  = nextLineAfter(/Fyrirvarar\s+kaupanda/i) || "";
    let conditionsBlock = nextLineAfter(/Fyrirvarar(\s*\/\s*sérákvæði)?/i) || nextLineAfter(/Sérákvæði/i) || "";

    let address = nextLineAfter(/^\s*Eign\s*$/i) || nextLineAfter(/Heimilisfang/i);
    let propId  = nextLineAfter(/fasteigna(nr\.|númer)|landnúmer/i);

    return {
      sellerName: seller.name, sellerSSN: seller.ssn,
      buyerName: buyerNames || buyer.name, buyerSSN: buyer.ssn,
      address, propId,
      price, deposit, handover,
      deedIssueDate,
      sellerContingencies: sellerCont,
      buyerContingencies:  buyerCont,
      conditions: conditionsBlock,
      raw: txt
    };
  }

  async function extractTextFromPDF_TextLayer(file) {
    if (!window.pdfjsLib) throw new Error("PDF.js hlaust ekki (pdfjsLib vantar).");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map(it => it.str).join(" ") + "\n";
    }
    console.log("PDF RAW TEXT (text-layer):", out);
    return out.trim();
  }

  async function extractTextFromPDF_OCR(file, progressCb) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let ocrText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataURL = canvas.toDataURL('image/png');
      const worker = await Tesseract.createWorker("eng+isl", 1);
      const { data } = await worker.recognize(dataURL);
      ocrText += data.text + "\n";
      await worker.terminate();
      if (progressCb) progressCb(i, pdf.numPages);
    }
    console.log("PDF RAW TEXT (ocr):", ocrText);
    return ocrText.trim();
  }

  async function extractSmart(file) {
    try {
      const textLayer = await extractTextFromPDF_TextLayer(file);
      if (textLayer && textLayer.split(/\s+/).length > 15) return { text: textLayer, method: "text-layer" };
    } catch (e) { /* fallback */ }
    const ocrBox = $('ocrState'), ocrBar = $('ocrProgress'), ocrMsg = $('ocrMsg');
    ocrBox.classList.remove('hidden'); ocrBar.value = 0; ocrMsg.textContent = "Byrja OCR...";
    const textOCR = await extractTextFromPDF_OCR(file, (i, n) => { ocrBar.value = Math.floor((i/n)*100); ocrMsg.textContent = `OCR síða ${i}/${n}`; });
    ocrBar.value = 100; ocrMsg.textContent = "OCR lokið";
    return { text: textOCR, method: "ocr" };
  }

  $('file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!window.pdfjsLib) throw new Error("PDF.js hlaust ekki (pdfjsLib is not defined).");
      const { text, method } = await extractSmart(file);
      $('raw').value = text || "";
      const p = parseFields(text || "");
      setValue('sellerName', p.sellerName); setValue('sellerSSN', p.sellerSSN);
      setValue('buyerName', p.buyerName);   setValue('buyerSSN', p.buyerSSN);
      setValue('propertyAddress', p.address); setValue('propertyId', p.propId);
      setValue('price', p.price); setValue('deposit', p.deposit);
      setValue('handover', p.handover); setValue('conditions', p.conditions);
      setValue('deedIssueDate', p.deedIssueDate);
      setValue('sellerContingencies', p.sellerContingencies);
      setValue('buyerContingencies', p.buyerContingencies);

      refreshSummary(p); checklist();
      $('summary').textContent += "\n\n[Aðferð] " + (method === "ocr" ? "OCR (Tesseract.js)" : "Textalag (PDF.js)");
    } catch (err) {
      $('summary').textContent = "Gat ekki lesið PDF: " + (err?.message || err);
    } finally {
      $('ocrState').classList.add('hidden');
    }
  });

  $('parseBtn').addEventListener('click', () => {
    const t = $('raw').value || "";
    const p = parseFields(t);
    setValue('sellerName', p.sellerName); setValue('sellerSSN', p.sellerSSN);
    setValue('buyerName', p.buyerName);   setValue('buyerSSN', p.buyerSSN);
    setValue('propertyAddress', p.address); setValue('propertyId', p.propId);
    setValue('price', p.price); setValue('deposit', p.deposit);
    setValue('handover', p.handover); setValue('conditions', p.conditions);
    setValue('deedIssueDate', p.deedIssueDate);
    setValue('sellerContingencies', p.sellerContingencies);
    setValue('buyerContingencies', p.buyerContingencies);
    refreshSummary(p); checklist();
  });

  $('clearBtn').addEventListener('click', () => {
    $('raw').value = "";
    [
      'sellerName','sellerSSN','buyerName','buyerSSN',
      'propertyAddress','propertyId','price','deposit',
      'handover','conditions','deedIssueDate',
      'sellerContingencies','buyerContingencies'
    ].forEach(id => setValue(id, ""));
    $('summary').textContent = "Hladdu upp PDF eða límdu texta hér að neðan.";
    $('checklist').innerHTML = ""; $('jsonOut').value = "";
  });

  ['hasLoan','hasChain','hasLandLease'].forEach(id => $(id).addEventListener('change', checklist));
  document.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', checklist));
  $('refreshChecklist').addEventListener('click', checklist);

  $('copyJson').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('jsonOut').value || ""); alert("JSON afritað!"); }
    catch { alert("Gat ekki afritað – veldu textann og afritaðu handvirkt."); }
  });

  // Email draft til banka
  $('btnLanaskjol').addEventListener('click', () => {
    const bankEmail = "";
    const subj = encodeURIComponent("Beiðni um lánaskjöl og veðbókarvottorð");
    const body = encodeURIComponent(
`Sælir/sælar,

Ég óska eftir lánayfirliti, uppgreiðsluáætlun og veðbókarvottorði.

Eign: ${getValue('propertyAddress')} (FN: ${getValue('propertyId')})
Seljandi: ${getValue('sellerName')} kt. ${getValue('sellerSSN')}
Kaupandi: ${getValue('buyerName')} kt. ${getValue('buyerSSN')}
Kaupverð: ${getValue('price')}
Afhending: ${getValue('handover')}

Kv. [nafn fasteignasala]`);
    window.location.href = `mailto:${bankEmail}?subject=${subj}&body=${body}`;
  });

  // DOCX veðflutningsbeiðni
  $('btnVedflutningur').addEventListener('click', async () => {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docx;
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Veðflutningsbeiðni", heading: HeadingLevel.HEADING_1 }),
          new Paragraph(" "),
          new Paragraph(new TextRun({ text: "Eign:", bold: true })), new Paragraph(`${getValue('propertyAddress')} (FN: ${getValue('propertyId')})`),
          new Paragraph(" "), new Paragraph(new TextRun({ text: "Aðilar", bold: true })),
          new Paragraph(`Seljandi: ${getValue('sellerName')} kt. ${getValue('sellerSSN')}`),
          new Paragraph(`Kaupandi: ${getValue('buyerName')} kt. ${getValue('buyerSSN')}`),
          new Paragraph(" "), new Paragraph(new TextRun({ text: "Beiðni", bold: true })),
          new Paragraph("Óskað er eftir veðflutningi á eftirfarandi láni/veðrétti yfir á nýjan eiganda:"),
          new Paragraph("• Lán/veðréttur: ____________________________"),
          new Paragraph("• Veðröð: ____________   • Eftirstöðvar: ____________ kr."),
          new Paragraph("• Banki/lánastofnun: ________________________"),
          new Paragraph(" "), new Paragraph(new TextRun({ text: "Forsendur", bold: true })),
          new Paragraph(`Kaupverð: ${getValue('price')} – afhendingardagur: ${getValue('handover')}`),
          new Paragraph("Veðflutningur er skilyrtur því að greiðsluflæði og skilyrði samræmist lögskilauppgjöri."),
          new Paragraph(" "), new Paragraph(new TextRun({ text: "Staðfesting", bold: true })),
          new Paragraph("Staðfest er að ofangreindar upplýsingar eru réttar. Beiðnin er lögð fram af fasteignasala fyrir hönd aðila."),
          new Paragraph(" "), new Paragraph("___________________________    ___________________________"),
          new Paragraph("Dags.                                    Undirskrift"),
        ]
      }]
    });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "vedflutningsbeidni.docx"; a.click(); URL.revokeObjectURL(a.href);
  });

  // DOCX skilyrt veðleyfi
  $('btnVedleyfi').addEventListener('click', async () => {
    const missing = [];
    if (!getValue('propertyAddress')) missing.push("Eign");
    if (!getValue('sellerName') || !getValue('sellerSSN')) missing.push("Seljandi (nafn/kt)");
    if (!getValue('buyerName')  || !getValue('buyerSSN'))  missing.push("Kaupandi (nafn/kt)");
    if (missing.length) { alert("Vantar: " + missing.join(", ")); return; }

    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docx;
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Beiðni um skilyrt veðleyfi", heading: HeadingLevel.HEADING_1 }),
          new Paragraph(" "),
          new Paragraph(new TextRun({ text: "Mál:", bold: true })),
          new Paragraph(`Eign: ${getValue('propertyAddress')} (FN: ${getValue('propertyId')})`),
          new Paragraph(`Seljandi: ${getValue('sellerName')} kt. ${getValue('sellerSSN')}`),
          new Paragraph(`Kaupandi: ${getValue('buyerName')} kt. ${getValue('buyerSSN')}`),
          new Paragraph(" "),
          new Paragraph(new TextRun({ text: "Beiðni:", bold: true })),
          new Paragraph("Óskað er eftir skilyrtu veðleyfi þar sem samþykkt er að veð skuldbindingar haldi gildi sínu eða færist samkvæmt samkomulagi, að því gefnu að skilyrði uppgjörs og veðflutnings séu uppfyllt við afsal."),
          new Paragraph(" "),
          new Paragraph(new TextRun({ text: "Forsendur:", bold: true })),
          new Paragraph(`Kaupverð: ${getValue('price')} | Trygging/útborgun: ${getValue('deposit')}`),
          new Paragraph(`Áætluð afhending: ${getValue('handover')}`),
          new Paragraph(`Sérákvæði/fyrirvarar: ${getValue('conditions')}`),
          new Paragraph(`Útgáfudagur afsals: ${getValue('deedIssueDate') || "(sjá greiðslutilhögun/við uppgjör)"}`),
          new Paragraph(" "),
          new Paragraph(new TextRun({ text: "Staðfesting:", bold: true })),
          new Paragraph("Staðfest að ofangreind gögn séu rétt og að veðleyfið verði aðeins virkjað ef skilyrði samnings og lögskilauppgjörs eru uppfyllt."),
          new Paragraph(" "),
          new Paragraph("___________________________    ___________________________"),
          new Paragraph("Dags.                                    Undirskrift"),
        ]
      }]
    });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "vedleyfisbeidni.docx"; a.click(); URL.revokeObjectURL(a.href);
  });

  console.log("Live split demo loaded:", new Date().toISOString());
});
