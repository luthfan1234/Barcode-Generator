/* ==========================================================================
   OmniTools — client logic
   Prinsip yang dipegang di file ini:
   - Respons instan: umpan balik muncul saat ditekan, bukan setelah request.
   - Debounce seminimal mungkin, dan hanya untuk yang memang memanggil server.
   - Setiap request bernomor; balasan yang sudah basi dibuang, jadi tidak ada
     pratinjau yang "mundur" saat mengetik cepat.
   - Aksi keyboard tidak dianimasikan.
   ========================================================================== */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var features = { qr: true, barcode: true, removebg: false, social: false };

  function icons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  /* ---------------------------------------------------------------- toast */

  var toast = $("toast");
  var toastText = $("toast-text");
  var toastIcon = $("toast-icon");
  var toastTimer = null;

  function showToast(message, variant) {
    clearTimeout(toastTimer);
    toastText.textContent = message;
    toast.dataset.variant = variant || "success";
    // Lucide mengganti elemen placeholder dengan <svg> baru, jadi ikonnya
    // ditulis ulang ke dalam wadah yang tetap — bukan atribut pada node lama.
    var name = variant === "error" ? "circle-alert" : variant === "info" ? "info" : "circle-check-big";
    toastIcon.innerHTML = '<i data-lucide="' + name + '" width="16" height="16"></i>';
    icons();
    toast.dataset.open = "true";
    toastTimer = setTimeout(function () {
      toast.dataset.open = "false";
    }, variant === "error" ? 4200 : 2600);
  }

  /* ------------------------------------------------------- state tombol */

  // Spinner baru muncul setelah 180ms. Request cepat tidak menimbulkan kedipan.
  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.disabled = true;
      button._spinTimer = setTimeout(function () {
        button.dataset.loading = "true";
      }, 180);
    } else {
      clearTimeout(button._spinTimer);
      button.disabled = false;
      delete button.dataset.loading;
    }
  }

  function setBusy(image, busy) {
    if (!image) return;
    if (busy) image.dataset.busy = "true";
    else delete image.dataset.busy;
  }

  /* -------------------------------------------------------- error inline */

  function showError(fieldId, errorId, message, action) {
    var field = $(fieldId);
    var box = $(errorId);
    if (field) field.dataset.invalid = "true";
    if (!box) return;
    box.textContent = "";
    var text = document.createElement("span");
    text.textContent = message;
    box.appendChild(text);
    if (action) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "field__error-action";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      box.appendChild(document.createTextNode(" "));
      box.appendChild(button);
    }
    box.hidden = false;
  }

  function clearError(fieldId, errorId) {
    var field = $(fieldId);
    var box = $(errorId);
    if (field) delete field.dataset.invalid;
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
  }

  /* ------------------------------------------------------------ fetch API */

  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(readJSON);
  }

  function readJSON(response) {
    return response.json().catch(function () {
      return { error: "Server membalas dalam format yang tidak dikenali." };
    }).then(function (payload) {
      if (!response.ok || !payload.success) {
        var error = new Error(payload.error || "Permintaan gagal (" + response.status + ").");
        error.payload = payload;
        error.status = response.status;
        throw error;
      }
      return payload;
    });
  }

  function chip(text, accent) {
    var span = document.createElement("span");
    span.className = accent ? "chip chip--accent" : "chip";
    span.textContent = text;
    return span;
  }

  function fillMeta(container, items) {
    container.textContent = "";
    items.filter(Boolean).forEach(function (item) {
      container.appendChild(chip(item.label, item.accent));
    });
    container.hidden = items.filter(Boolean).length === 0;
  }

  var root = document.documentElement;

  /* ------------------------------------------------- scroll edge header */

  var header = $("site-header");
  var scrollQueued = false;
  function syncHeader() {
    header.dataset.scrolled = window.scrollY > 4 ? "true" : "false";
    scrollQueued = false;
  }
  window.addEventListener("scroll", function () {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(syncHeader);
    }
  }, { passive: true });
  syncHeader();

  /* ---------------------------------------------------------------- tabs */

  var segmented = $("segmented");
  var tabs = Array.prototype.slice.call(segmented.querySelectorAll('[role="tab"]'));
  var layer = segmented.querySelector(".segmented__layer");
  var activeTab = "qr";
  var visited = { qr: true };

  function moveIndicator() {
    var button = tabs.filter(function (t) { return t.dataset.tab === activeTab; })[0];
    if (!button) return;
    // offsetLeft dipakai, bukan getBoundingClientRect: track bisa di-scroll
    // horizontal di layar sempit, dan offsetLeft tidak ikut bergeser.
    var left = button.offsetLeft - 4; // 4px = padding track
    layer.style.setProperty("--clip-left", left + "px");
    layer.style.setProperty("--clip-right", (left + button.offsetWidth) + "px");
    segmented.dataset.ready = "true";
    keepTabVisible(button);
  }

  // Track yang bisa di-scroll: pastikan tab terpilih tidak tersembunyi.
  function keepTabVisible(button) {
    var padding = 8;
    var left = button.offsetLeft - padding;
    var right = button.offsetLeft + button.offsetWidth + padding;
    if (left < segmented.scrollLeft) segmented.scrollLeft = left;
    else if (right > segmented.scrollLeft + segmented.clientWidth) {
      segmented.scrollLeft = right - segmented.clientWidth;
    }
  }

  function switchTab(id, animate) {
    if (!tabs.some(function (t) { return t.dataset.tab === id; })) return;
    activeTab = id;

    tabs.forEach(function (tab) {
      var selected = tab.dataset.tab === id;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      var panel = $("panel-" + tab.dataset.tab);
      if (!panel) return;
      delete panel.dataset.animate;
      panel.hidden = !selected;
      if (selected && animate) {
        void panel.offsetWidth; // paksa reflow supaya animasi selalu terpicu ulang
        panel.dataset.animate = "true";
      }
    });

    moveIndicator();

    // Barcode baru dibuat saat tab-nya pertama kali dibuka, bukan saat halaman
    // dimuat — tidak ada request yang tidak pernah dilihat orang.
    if (id === "barcode" && !visited.barcode) {
      visited.barcode = true;
      generateBarcode("auto");
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () { switchTab(tab.dataset.tab, true); });
  });

  segmented.addEventListener("keydown", function (event) {
    var index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    var next = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    tabs[next].focus();
    // Dipicu keyboard: tanpa animasi panel (aturan frekuensi).
    switchTab(tabs[next].dataset.tab, false);
  });

  window.addEventListener("resize", moveIndicator);
  if (window.ResizeObserver) new ResizeObserver(moveIndicator).observe(segmented);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveIndicator);

  // Tautan footer memilih alat sekaligus membawa ke bagiannya, supaya strip
  // tab ikut terlihat — bukan cuma panelnya.
  document.querySelectorAll("[data-goto]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      switchTab(link.dataset.goto, true);
      var target = document.getElementById("alat") || document.querySelector(".workspace");
      var halus = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: halus ? "smooth" : "auto", block: "start" });
    });
  });

  /* ------------------------------------------------- tempel / unduh / salin */

  document.addEventListener("click", function (event) {
    var pasteTarget = event.target.closest("[data-paste]");
    if (pasteTarget) return handlePaste(pasteTarget.dataset.paste);

    var downloadTarget = event.target.closest("[data-download]");
    if (downloadTarget) {
      return downloadImage($(downloadTarget.dataset.download), downloadTarget.dataset.filename);
    }

    var copyTarget = event.target.closest("[data-copy]");
    if (copyTarget) return copyImage($(copyTarget.dataset.copy));
  });

  function handlePaste(inputId) {
    var input = $(inputId);
    if (!input) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      input.focus();
      showToast("Browser ini butuh tempel manual (Ctrl+V)", "info");
      return;
    }
    navigator.clipboard.readText().then(function (text) {
      if (!text) return showToast("Clipboard kosong", "info");
      input.value = text.trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      showToast("Teks ditempel");
    }).catch(function () {
      input.focus();
      showToast("Izin clipboard ditolak, tempel manual dengan Ctrl+V", "info");
    });
  }

  function downloadImage(image, filename) {
    if (!image || !image.src) return;
    var link = document.createElement("a");
    link.href = image.src;
    link.download = filename || "omnitools.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("Gambar diunduh");
  }

  function copyImage(image) {
    if (!image || !image.src) return;
    if (!navigator.clipboard || !window.ClipboardItem) {
      showToast("Browser ini belum mendukung salin gambar. Pakai tombol unduh.", "error");
      return;
    }
    fetch(image.src)
      .then(function (r) { return r.blob(); })
      .then(function (blob) {
        var item = {};
        item[blob.type] = blob;
        return navigator.clipboard.write([new ClipboardItem(item)]);
      })
      .then(function () { showToast("Gambar disalin ke clipboard"); })
      .catch(function () { showToast("Gagal menyalin gambar. Pakai tombol unduh.", "error"); });
  }

  /* ------------------------------------------------------------- QR Code */

  var qrInput = $("qr-data");
  var qrImage = $("qr-image");
  var qrEmpty = $("qr-empty");
  var qrActions = $("qr-actions");
  var qrMeta = $("qr-meta");
  var qrSubmit = $("qr-submit");
  var qrCounter = $("qr-counter");
  var qrTimer = null;
  var qrSeq = 0;

  function qrPayload() {
    return {
      data: qrInput.value.trim(),
      fill_color: $("qr-fill").value,
      back_color: $("qr-back").value,
      error_correction: $("qr-ec").value,
      box_size: 10
    };
  }

  function generateQR(source) {
    var body = qrPayload();
    qrCounter.textContent = body.data.length + " / 2000";

    if (!body.data) {
      qrSeq += 1;
      qrImage.hidden = true;
      qrActions.hidden = true;
      qrMeta.hidden = true;
      qrEmpty.hidden = false;
      // Menghapus isi kolom bukan kesalahan, jadi tidak diomeli. Tapi menekan
      // tombolnya saat kosong adalah aksi sadar — itu harus dijawab.
      if (source === "manual") {
        showError("qr-field", "qr-error", "Isi teks atau link URL dulu.");
        qrInput.focus();
      } else {
        clearError("qr-field", "qr-error");
      }
      return;
    }

    var seq = ++qrSeq;
    if (source === "manual") setLoading(qrSubmit, true);
    setBusy(qrImage, true);

    postJSON("/api/qr", body).then(function (result) {
      if (seq !== qrSeq) return; // sudah ada ketikan yang lebih baru
      clearError("qr-field", "qr-error");
      qrImage.src = result.image_data;
      qrImage.hidden = false;
      qrEmpty.hidden = true;
      qrActions.hidden = false;
      fillMeta(qrMeta, [
        { label: "Versi " + result.version },
        { label: "Koreksi " + result.error_correction },
        { label: result.size + " px" }
      ]);
    }).catch(function (error) {
      if (seq !== qrSeq) return;
      showError("qr-field", "qr-error", error.message);
      if (source === "manual") showToast(error.message, "error");
    }).then(function () {
      if (seq !== qrSeq) return;
      setBusy(qrImage, false);
      if (source === "manual") setLoading(qrSubmit, false);
    });
  }

  qrInput.addEventListener("input", function () {
    qrCounter.textContent = qrInput.value.trim().length + " / 2000";
    clearTimeout(qrTimer);
    qrTimer = setTimeout(function () { generateQR("auto"); }, 220);
  });

  ["qr-fill", "qr-back", "qr-ec"].forEach(function (id) {
    $(id).addEventListener("input", function () { generateQR("auto"); });
  });

  ["qr-fill", "qr-back"].forEach(function (id) {
    var input = $(id);
    var label = $(id + "-label");
    input.addEventListener("input", function () {
      label.textContent = input.value.toUpperCase();
    });
  });

  qrSubmit.addEventListener("click", function () { generateQR("manual"); });
  qrInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      clearTimeout(qrTimer);
      generateQR("manual");
    }
  });

  /* ------------------------------------------------------------- Barcode */

  var BARCODE_RULES = {
    code128: "Huruf, angka, dan simbol ASCII, 1–48 karakter.",
    code39: "HURUF KAPITAL, angka, dan simbol - . spasi $ / + % (huruf kecil dikapitalkan otomatis).",
    ean13: "12 digit angka — check digit ke-13 dihitung otomatis.",
    ean8: "7 digit angka — check digit ke-8 dihitung otomatis.",
    upca: "11 digit angka — check digit ke-12 dihitung otomatis.",
    isbn13: "Diawali 978 atau 979, total 12–13 digit.",
    itf: "Hanya angka, jumlah digitnya harus genap."
  };

  var barcodeInput = $("barcode-data");
  var barcodeType = $("barcode-type");
  var barcodeImage = $("barcode-image");
  var barcodeEmpty = $("barcode-empty");
  var barcodeActions = $("barcode-actions");
  var barcodeMeta = $("barcode-meta");
  var barcodeSubmit = $("barcode-submit");
  var barcodeRule = $("barcode-rule-text");
  var barcodeTimer = null;
  var barcodeSeq = 0;

  function syncBarcodeRule() {
    barcodeRule.textContent = BARCODE_RULES[barcodeType.value] || "";
  }

  function generateBarcode(source) {
    var data = barcodeInput.value.trim();

    if (!data) {
      barcodeSeq += 1;
      barcodeImage.hidden = true;
      barcodeActions.hidden = true;
      barcodeMeta.hidden = true;
      barcodeEmpty.hidden = false;
      if (source === "manual") {
        showError("barcode-field", "barcode-error", "Isi kode atau nomor produk dulu.");
        barcodeInput.focus();
      } else {
        clearError("barcode-field", "barcode-error");
      }
      return;
    }

    var seq = ++barcodeSeq;
    if (source === "manual") setLoading(barcodeSubmit, true);
    setBusy(barcodeImage, true);

    postJSON("/api/barcode", {
      data: data,
      type: barcodeType.value,
      fill_color: $("barcode-fill").value,
      back_color: $("barcode-back").value
    }).then(function (result) {
      if (seq !== barcodeSeq) return;
      clearError("barcode-field", "barcode-error");
      barcodeImage.src = result.image_data;
      barcodeImage.hidden = false;
      barcodeEmpty.hidden = true;
      barcodeActions.hidden = false;
      fillMeta(barcodeMeta, [
        { label: result.type.toUpperCase() },
        { label: result.code },
        result.adjusted ? { label: "check digit ditambahkan", accent: true } : null
      ]);
    }).catch(function (error) {
      if (seq !== barcodeSeq) return;
      var fallback = error.payload && error.payload.fallback;
      showError("barcode-field", "barcode-error", error.message, fallback ? {
        label: "Pakai Code 128",
        onClick: function () {
          barcodeType.value = "code128";
          syncBarcodeRule();
          generateBarcode("manual");
        }
      } : null);
      if (source === "manual") showToast(error.message, "error");
    }).then(function () {
      if (seq !== barcodeSeq) return;
      setBusy(barcodeImage, false);
      if (source === "manual") setLoading(barcodeSubmit, false);
    });
  }

  barcodeInput.addEventListener("input", function () {
    clearTimeout(barcodeTimer);
    barcodeTimer = setTimeout(function () { generateBarcode("auto"); }, 260);
  });

  barcodeType.addEventListener("change", function () {
    syncBarcodeRule();
    generateBarcode("auto");
  });

  ["barcode-fill", "barcode-back"].forEach(function (id) {
    var input = $(id);
    var label = $(id + "-label");
    input.addEventListener("input", function () {
      label.textContent = input.value.toUpperCase();
      generateBarcode("auto");
    });
  });

  barcodeSubmit.addEventListener("click", function () { generateBarcode("manual"); });
  barcodeInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      clearTimeout(barcodeTimer);
      generateBarcode("manual");
    }
  });

  syncBarcodeRule();

  /* ---------------------------------------------------------- Downloader */

  var socialUrl = $("social-url");
  var socialSubmit = $("social-submit");
  var socialResult = $("social-result");
  var socialChips = Array.prototype.slice.call(document.querySelectorAll("[data-platform]"));
  var HOST_MAP = {
    instagram: ["instagram.com", "instagr.am"],
    tiktok: ["tiktok.com"],
    youtube: ["youtube.com", "youtu.be"],
    facebook: ["facebook.com", "fb.watch"]
  };

  // Platform ditandai langsung saat link ditempel — konfirmasi instan bahwa
  // linknya dikenali, tanpa menunggu request.
  function highlightPlatform() {
    var value = socialUrl.value.trim().toLowerCase();
    socialChips.forEach(function (item) {
      var hosts = HOST_MAP[item.dataset.platform] || [];
      var match = value && hosts.some(function (host) { return value.indexOf(host) !== -1; });
      if (match) item.dataset.active = "true";
      else delete item.dataset.active;
    });
  }

  socialUrl.addEventListener("input", function () {
    highlightPlatform();
    clearError("social-field", "social-error");
  });

  function resolveSocial() {
    var url = socialUrl.value.trim();
    if (!url) {
      showError("social-field", "social-error", "Link konten belum diisi.");
      socialUrl.focus();
      return;
    }

    clearError("social-field", "social-error");
    setLoading(socialSubmit, true);
    socialResult.hidden = true;

    postJSON("/api/social/resolve", { url: url }).then(function (info) {
      $("social-title").textContent = info.title;

      var thumb = $("social-thumb");
      thumb.textContent = "";
      if (info.thumbnail) {
        var image = document.createElement("img");
        image.src = info.thumbnail;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", function () {
          thumb.innerHTML = '<i data-lucide="play" width="26" height="26"></i>';
          icons();
        });
        thumb.appendChild(image);
      } else {
        thumb.innerHTML = '<i data-lucide="play" width="26" height="26"></i>';
      }

      fillMeta($("social-meta"), [
        { label: info.platform_label, accent: true },
        info.uploader ? { label: info.uploader } : null,
        info.duration ? { label: info.duration } : null,
        info.quality ? { label: info.quality } : null
      ]);
      $("social-meta").hidden = false;

      $("social-get-video").disabled = !info.has_video;
      $("social-get-audio").disabled = !info.has_audio;
      socialResult.hidden = false;
      icons();
      showToast("Media terdeteksi");
    }).catch(function (error) {
      showError("social-field", "social-error", error.message);
      showToast(error.message, "error");
    }).then(function () {
      setLoading(socialSubmit, false);
    });
  }

  socialSubmit.addEventListener("click", resolveSocial);
  socialUrl.addEventListener("keydown", function (event) {
    if (event.key === "Enter") resolveSocial();
  });

  function filenameFrom(response, fallback) {
    var header = response.headers.get("Content-Disposition") || "";
    var match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
    return match ? decodeURIComponent(match[1]) : fallback;
  }

  function downloadSocial(mode, button) {
    setLoading(button, true);
    showToast("Mengambil file dari server…", "info");

    fetch("/api/social/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: socialUrl.value.trim(), mode: mode })
    }).then(function (response) {
      var type = response.headers.get("Content-Type") || "";
      if (!response.ok || type.indexOf("application/json") !== -1) {
        return readJSON(response); // selalu melempar: badan JSON berarti error
      }
      return response.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = filenameFrom(response, mode === "audio" ? "omnitools.m4a" : "omnitools.mp4");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        showToast("Berhasil diunduh");
      });
    }).catch(function (error) {
      showToast(error.message || "Unduhan gagal.", "error");
    }).then(function () {
      setLoading(button, false);
    });
  }

  $("social-get-video").addEventListener("click", function () {
    downloadSocial("video", this);
  });
  $("social-get-audio").addEventListener("click", function () {
    downloadSocial("audio", this);
  });

  /* ----------------------------------------------------- Remove Background */

  var dropzone = $("dropzone");
  var bgInput = $("bg-input");
  var bgProgress = $("removebg-progress");
  var bgResult = $("removebg-result");
  var compareBefore = $("compare-before");
  var compareAfterImg = $("compare-after-img");

  dropzone.addEventListener("click", function () { bgInput.click(); });
  bgInput.addEventListener("change", function () {
    if (bgInput.files && bgInput.files[0]) processImage(bgInput.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (name) {
    dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      dropzone.dataset.dragover = "true";
    });
  });
  ["dragleave", "dragend", "drop"].forEach(function (name) {
    dropzone.addEventListener(name, function (event) {
      event.preventDefault();
      delete dropzone.dataset.dragover;
    });
  });
  dropzone.addEventListener("drop", function (event) {
    var files = event.dataTransfer && event.dataTransfer.files;
    if (files && files[0]) processImage(files[0]);
  });
  // Tanpa ini, menjatuhkan file di luar dropzone akan membuka file itu di tab.
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) { e.preventDefault(); });

  function processImage(file) {
    if (!features.removebg) {
      showToast("Fitur hapus latar belum aktif di server ini.", "error");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      $("removebg-error").textContent =
        "Ukuran " + (file.size / 1048576).toFixed(1) + " MB melebihi batas 15 MB.";
      $("removebg-error").hidden = false;
      return;
    }

    $("removebg-error").hidden = true;
    compareBefore.src = URL.createObjectURL(file);
    dropzone.hidden = true;
    bgResult.hidden = true;
    bgProgress.hidden = false;

    var form = new FormData();
    form.append("image", file);

    fetch("/api/remove-bg", { method: "POST", body: form })
      .then(readJSON)
      .then(function (result) {
        compareAfterImg.src = result.image_data;
        bgProgress.hidden = true;
        bgResult.hidden = false;
        fillMeta($("removebg-meta"), [
          { label: result.width + " × " + result.height + " px" },
          result.downscaled
            ? { label: "diperkecil dari " + result.original_width + " × " + result.original_height, accent: true }
            : null
        ]);
        setComparePosition(50);
        showToast("Latar belakang dihapus");
      })
      .catch(function (error) {
        bgProgress.hidden = true;
        dropzone.hidden = false;
        $("removebg-error").textContent = error.message;
        $("removebg-error").hidden = false;
        showToast(error.message, "error");
      });
  }

  $("removebg-reset").addEventListener("click", function () {
    bgInput.value = "";
    bgResult.hidden = true;
    bgProgress.hidden = true;
    dropzone.hidden = false;
    $("removebg-error").hidden = true;
    dropzone.focus();
  });

  /* Compare slider — pointer dilacak 1:1, tanpa transisi selama menggeser. */
  var compare = $("compare");
  var compareAfter = $("compare-after");
  var compareHandle = $("compare-handle");
  var comparePos = 50;

  function setComparePosition(percent) {
    comparePos = Math.max(0, Math.min(100, percent));
    // clip-path & transform di-set langsung pada elemennya, bukan lewat CSS
    // variable di induk, supaya tidak memicu recalculate seluruh anak.
    // Kedua sisi dipotong saling melengkapi: tanpa memotong foto asli, area
    // transparan pada hasil akan menampilkan foto asli di bawahnya.
    compareBefore.style.clipPath = "inset(0 " + (100 - comparePos) + "% 0 0)";
    compareAfter.style.clipPath = "inset(0 0 0 " + comparePos + "%)";
    compareHandle.style.transform = "translateX(" + (compare.clientWidth * comparePos / 100) + "px)";
    compareHandle.setAttribute("aria-valuenow", Math.round(comparePos));
  }

  function positionFromEvent(event) {
    var rect = compare.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * 100;
  }

  compare.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    compare.setPointerCapture(event.pointerId);
    compare.dataset.dragging = "true";
    setComparePosition(positionFromEvent(event));
  });

  compare.addEventListener("pointermove", function (event) {
    if (compare.dataset.dragging !== "true") return;
    setComparePosition(positionFromEvent(event));
  });

  ["pointerup", "pointercancel"].forEach(function (name) {
    compare.addEventListener(name, function (event) {
      delete compare.dataset.dragging;
      if (compare.hasPointerCapture(event.pointerId)) compare.releasePointerCapture(event.pointerId);
    });
  });

  compareHandle.addEventListener("keydown", function (event) {
    var step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setComparePosition(comparePos - step);
    else if (event.key === "ArrowRight") setComparePosition(comparePos + step);
    else if (event.key === "Home") setComparePosition(0);
    else if (event.key === "End") setComparePosition(100);
    else return;
    event.preventDefault();
  });

  compareAfterImg.addEventListener("load", function () { setComparePosition(comparePos); });
  window.addEventListener("resize", function () { setComparePosition(comparePos); });

  /* ------------------------------------------------- scroll reveal (landing)

     Gate: frekuensi "jarang / kunjungan pertama", tujuan mencegah section
     muncul mendadak. Hanya dipasang di section marketing — UI alat tidak
     ikut dianimasikan. Dijalankan sekali per elemen; mengulang animasi
     setiap kali di-scroll lewat berarti antarmuka melawan pembacanya.      */

  var revealables = document.querySelectorAll(".reveal");

  if (root.dataset.reveal === "on" && "IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.dataset.visible = "true";
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -72px 0px", threshold: 0.05 });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  } else {
    // Tanpa observer, CSS memang tidak pernah menyembunyikannya. Ditandai
    // terlihat supaya keadaannya tetap konsisten.
    revealables.forEach(function (el) { el.dataset.visible = "true"; });
  }

  /* ---------------------------------------------------------- FAQ accordion

     height adalah satu-satunya properti non-GPU yang dianimasikan di sini,
     karena accordion memang tidak punya padanan transform. Tingginya diukur
     dari scrollHeight, bukan dianimasikan ke `auto` — `auto` tidak bisa
     di-interpolasi. Setelah terbuka, height dilepas kembali ke `auto` supaya
     isinya tetap ikut kalau teks membungkus ulang saat layar diubah.        */

  document.querySelectorAll(".faq__trigger").forEach(function (trigger) {
    var panel = document.getElementById(trigger.getAttribute("aria-controls"));
    if (!panel) return;

    panel.addEventListener("transitionend", function (event) {
      if (event.target !== panel || event.propertyName !== "height") return;
      if (panel.dataset.open === "true") panel.style.height = "auto";
    });

    trigger.addEventListener("click", function () {
      var terbuka = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", terbuka ? "false" : "true");

      if (terbuka) {
        // Dari `auto` ke nilai pasti dulu, baru ke 0 — tanpa nilai awal yang
        // konkret, transisinya tidak punya apa pun untuk di-interpolasi.
        panel.style.height = panel.scrollHeight + "px";
        void panel.offsetHeight;
        delete panel.dataset.open;
        panel.style.height = "0px";
      } else {
        panel.dataset.open = "true";
        panel.style.height = panel.scrollHeight + "px";
      }
    });
  });

  /* -------------------------------------------------------------- init */

  fetch("/api/status")
    .then(function (r) { return r.json(); })
    .then(function (status) {
      features = status;

      $("social-unavailable").hidden = !!status.social;
      $("removebg-unavailable").hidden = !!status.removebg;
      socialSubmit.disabled = !status.social;
      dropzone.disabled = !status.removebg;

      var missing = [];
      if (!status.social) missing.push("Downloader");
      if (!status.removebg) missing.push("Remove BG");
      var badge = $("status-chip");
      if (missing.length) {
        badge.textContent = missing.length + " tool perlu setup";
        badge.hidden = false;
      }
    })
    .catch(function () { /* status opsional; UI tetap jalan */ });

  icons();
  moveIndicator();
  generateQR("init");
})();
