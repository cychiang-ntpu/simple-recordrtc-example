// Waveform Worker: maintains decimated min/max arrays and draws to OffscreenCanvas.
// Accumulated canvas/context
let offscreen, ctx;
let width = 0, height = 0;
// Optional overview canvas/context
let overviewOffscreen, overviewCtx;
let overviewWidth = 0, overviewHeight = 0;
let sampleMin = []; // array of min per decimated block
let sampleMax = []; // array of max per decimated block
let sourceSampleRate = 48000;
let decimationFactor = 10;
let verticalMode = false;
let showClipMarks = true;

function clearCanvas(){
  if (!ctx) return;
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0,0,width,height);
  // mid line
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1;
  if (!verticalMode) {
    ctx.beginPath(); ctx.moveTo(0,height/2); ctx.lineTo(width,height/2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(width/2,0); ctx.lineTo(width/2,height); ctx.stroke();
  }
}

function clearOverview(){
  if (!overviewCtx) return;
  overviewCtx.clearRect(0,0,overviewWidth,overviewHeight);
  overviewCtx.fillStyle = '#f5f5f5';
  overviewCtx.fillRect(0,0,overviewWidth,overviewHeight);
}

function appendBlocks(minArr, maxArr){
  for(let i=0;i<minArr.length;i++){ sampleMin.push(minArr[i]); sampleMax.push(maxArr[i]); }
}

function draw(params){
  if (!ctx) return;
  clearCanvas();
  const total = sampleMin.length;
  if (!total){ clearOverview(); return; }
  const zoomFactor = params.zoomFactor || 1;
  const viewStart = params.viewStart || 0;
  const visibleSamples = Math.min(total, Math.round(total/zoomFactor));
  const start = Math.min(viewStart, Math.max(0,total-visibleSamples));
  const end = Math.min(total, start + visibleSamples);
  const centerY = height/2;
  const centerX = width/2;
  const samplesPerPixel = (end-start)/(verticalMode?height:width);
  const dpr = (typeof params.dpr === 'number' && params.dpr > 0) ? params.dpr : 1;
  const dynEnabled = (params.dynamicDetailEnabled !== false);
  ctx.strokeStyle = '#1E88E5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // 若收到原始 PCM（rawPcm）且可視樣本數很少，改用連續線描高解析度
  const highResPcm = params.rawPcm instanceof Float32Array ? params.rawPcm : null;
  // 動態細緻度：以可視原始樣本密度決定
  const pixelCount = verticalMode ? height : width;
  const visibleRawFromMsg = (typeof params.visibleRaw === 'number' && params.visibleRaw > 0) ? params.visibleRaw : (visibleSamples * Math.max(1, decimationFactor));
  let densityR = (pixelCount > 0) ? (visibleRawFromMsg / (pixelCount * dpr)) : 0; // 每像素幾個原始樣本
  let detail;
  let highResMode;
  if (dynEnabled) {
    // 動態模式：以密度決定
    detail = Math.max(0, Math.min(1, 1 / (1 + densityR)));
    highResMode = !!highResPcm && (densityR <= 1.5 || visibleSamples <= 4);
  } else {
    // 傳統模式：維持舊邏輯
    densityR = NaN;
    detail = Math.max(0, Math.min(1, 4 / Math.max(1, visibleSamples)));
    highResMode = !!highResPcm && (visibleSamples <= 4);
  }
  // 自動密度調整：用於曲線（線段），圓點永遠使用原始樣本列（不插值）
  const origForDots = highResPcm;
  let pcmForDraw = highResPcm;
  if (highResMode && pcmForDraw) {
    // 期望曲線點數：接近像素數，並隨細緻度微調
    const px = pixelCount;
    const len = pcmForDraw.length;
    const desired = Math.max(32, Math.min(px, Math.round(px * (0.7 + 0.3 * detail))));
    if (len < desired && len > 1) {
      // 太稀疏：做線性插值至 desired
      const target = desired;
      const interp = new Float32Array(target);
      for (let i=0;i<target;i++){
        const pos = (i/(target-1))*(len-1);
        const idx0 = Math.floor(pos);
        const idx1 = Math.min(len-1, idx0+1);
        const t = pos - idx0;
        const v = (1-t)*pcmForDraw[idx0] + t*pcmForDraw[idx1];
        interp[i] = v;
      }
      pcmForDraw = interp;
    } else if (len > desired * 2) {
      // 太密集：stride 下採樣，保留至 ~2*desired
      const stride = Math.ceil(len / (desired * 2));
      const ds = new Float32Array(Math.ceil(len/stride));
      let o=0; for (let i=0;i<len;i+=stride){ ds[o++] = pcmForDraw[i]; }
      if (o < ds.length) pcmForDraw = ds.subarray(0,o); else pcmForDraw = ds;
    }
  }

  if (!verticalMode){
    if (samplesPerPixel <= 1){
      if (highResMode) {
        // 以原始 PCM 連續繪製線段
        ctx.strokeStyle = '#1565C0';
        ctx.lineWidth = 0.9 + 1.1 * detail; // 依細緻度微調線寬
        ctx.beginPath();
        const len = pcmForDraw.length;
        for (let i=0;i<len;i++){
          const s = Math.max(-1, Math.min(1, pcmForDraw[i]));
          const x = (i/(len-1))*width;
          const y = centerY - s*centerY;
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
        // 樣本點圓點（只用原始樣本，不使用插值或下採樣）
        if (origForDots && origForDots.length) {
          ctx.fillStyle = 'rgba(21,101,192,0.85)';
          const radius = Math.max(1.5, Math.min(5, (width/320) * (0.8 + 0.6*detail)));
          const rawLen = origForDots.length;
          const px = width;
          const stride = rawLen > px ? Math.ceil(rawLen / (px * (0.8 + 0.6*detail))) : 1; // zoom 越大 stride 越小
          for (let i=0;i<rawLen;i+=stride){
            const s = Math.max(-1, Math.min(1, origForDots[i]));
            const x = (i/(rawLen-1))*width;
            const y = centerY - s*centerY;
            ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
          }
        }
      } else {
        const spacing = visibleSamples>1? width/(visibleSamples-1): width;
        for(let i=0;i<visibleSamples;i++){
          const idx = start+i; if (idx>=end) break;
          let min = sampleMin[idx], max = sampleMax[idx];
          const columnOffset = (max+min)/2; max -= columnOffset; min -= columnOffset;
          max = Math.max(-1, Math.min(1,max)); min = Math.max(-1, Math.min(1,min));
          const x = visibleSamples>1? i*spacing: width/2;
          const yTop = centerY - max*centerY;
          const yBottom = centerY - min*centerY;
          ctx.moveTo(x+0.5,yTop); ctx.lineTo(x+0.5,yBottom);
          if (showClipMarks && (Math.abs(max)>=0.99 || Math.abs(min)>=0.99)){
            ctx.stroke(); ctx.save(); ctx.fillStyle='rgba(176,0,32,0.45)'; ctx.fillRect(x-1,0,2,height); ctx.restore(); ctx.beginPath();
          }
        }
      }
    } else {
      for(let x=0;x<width;x++){
        const rangeStart = start + x*samplesPerPixel;
        const rangeEnd = rangeStart + samplesPerPixel;
        let sIdx = Math.max(Math.floor(rangeStart), start);
        let eIdx = Math.min(Math.floor(rangeEnd), end-1);
        if (eIdx < sIdx) eIdx = sIdx;
        let min=1, max=-1;
        for(let k=sIdx;k<=eIdx;k++){ if(sampleMin[k]<min) min=sampleMin[k]; if(sampleMax[k]>max) max=sampleMax[k]; }
        const columnOffset = (max+min)/2; max -= columnOffset; min -= columnOffset;
        max = Math.max(-1, Math.min(1,max)); min = Math.max(-1, Math.min(1,min));
        const yTop = centerY - max*centerY;
        const yBottom = centerY - min*centerY;
        ctx.moveTo(x+0.5,yTop); ctx.lineTo(x+0.5,yBottom);
        if (showClipMarks && (Math.abs(max)>=0.99 || Math.abs(min)>=0.99)){
          ctx.stroke(); ctx.save(); ctx.fillStyle='rgba(176,0,32,0.30)'; ctx.fillRect(x,0,1,height); ctx.restore(); ctx.beginPath();
        }
      }
    }
  } else {
    // vertical mode
    if (samplesPerPixel <= 1){
      if (highResMode) {
        ctx.strokeStyle='#1565C0'; ctx.lineWidth = 0.9 + 1.1 * detail; ctx.beginPath();
        const len = pcmForDraw.length;
        for (let i=0;i<len;i++){
          const s = Math.max(-1, Math.min(1, pcmForDraw[i]));
          const y = (i/(len-1))*height;
          const x = centerX + s*centerX;
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
        if (origForDots && origForDots.length) {
          ctx.fillStyle='rgba(21,101,192,0.85)';
          const radius = Math.max(1.5, Math.min(5, (height/320) * (0.8 + 0.6*detail)));
          const rawLen = origForDots.length;
          const px = height;
          const stride = rawLen > px ? Math.ceil(rawLen / (px * (0.8 + 0.6*detail))) : 1;
          for (let i=0;i<rawLen;i+=stride){
            const s = Math.max(-1, Math.min(1, origForDots[i]));
            const y = (i/(rawLen-1))*height;
            const x = centerX + s*centerX;
            ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
          }
        }
      } else {
        const spacingY = visibleSamples>1? height/(visibleSamples-1): height;
        for(let i=0;i<visibleSamples;i++){
          const idx = start+i; if (idx>=end) break;
          let min = sampleMin[idx], max = sampleMax[idx];
          const columnOffset=(max+min)/2; max-=columnOffset; min-=columnOffset;
          max = Math.max(-1, Math.min(1,max)); min = Math.max(-1, Math.min(1,min));
          const y = visibleSamples>1? i*spacingY: height/2;
          const xLeft = centerX + min*centerX;
          const xRight = centerX + max*centerX;
          ctx.moveTo(xLeft,y+0.5); ctx.lineTo(xRight,y+0.5);
          if (showClipMarks && (Math.abs(max)>=0.99 || Math.abs(min)>=0.99)){
            ctx.stroke(); ctx.save(); ctx.fillStyle='rgba(176,0,32,0.45)'; ctx.fillRect(0,y-1,width,2); ctx.restore(); ctx.beginPath();
          }
        }
      }
    } else {
      for(let y=0;y<height;y++){
        const rangeStart = start + y*samplesPerPixel;
        const rangeEnd = rangeStart + samplesPerPixel;
        let sIdx = Math.max(Math.floor(rangeStart), start);
        let eIdx = Math.min(Math.floor(rangeEnd), end-1);
        if (eIdx < sIdx) eIdx = sIdx;
        let min=1,max=-1;
        for(let k=sIdx;k<=eIdx;k++){ if(sampleMin[k]<min) min=sampleMin[k]; if(sampleMax[k]>max) max=sampleMax[k]; }
        const off=(max+min)/2; max-=off; min-=off;
        max = Math.max(-1, Math.min(1,max)); min = Math.max(-1, Math.min(1,min));
        const xLeft = centerX + min*centerX;
        const xRight = centerX + max*centerX;
        ctx.moveTo(xLeft,y+0.5); ctx.lineTo(xRight,y+0.5);
        if (showClipMarks && (Math.abs(max)>=0.99 || Math.abs(min)>=0.99)){
          ctx.stroke(); ctx.save(); ctx.fillStyle='rgba(176,0,32,0.30)'; ctx.fillRect(0,y,width,1); ctx.restore(); ctx.beginPath();
        }
      }
    }
  }
  ctx.stroke();

  // 繪製選取區域（若有）
  const selStart = params.selectionStart;
  const selEnd = params.selectionEnd;
  if (typeof selStart === 'number' && typeof selEnd === 'number' && selStart !== selEnd) {
    const ss = Math.min(selStart, selEnd);
    const se = Math.max(selStart, selEnd);
    if (se >= start && ss <= end) {
      const visStart = Math.max(ss, start);
      const visEnd = Math.min(se, end);
      ctx.save();
      ctx.fillStyle = 'rgba(100, 149, 237, 0.2)';
      if (!verticalMode) {
        const x1 = ((visStart - start) / visibleSamples) * width;
        const x2 = ((visEnd - start) / visibleSamples) * width;
        ctx.fillRect(x1, 0, x2 - x1, height);
      } else {
        const y1 = ((visStart - start) / visibleSamples) * height;
        const y2 = ((visEnd - start) / visibleSamples) * height;
        ctx.fillRect(0, y1, width, y2 - y1);
      }
      ctx.restore();
    }
  }

  // 繪製播放位置指示器
  const pb = params.playbackPosition;
  const totalSamples = sampleMin.length;
  if (typeof pb === 'number' && pb >= 0 && pb <= totalSamples) {
    if (pb >= start && pb <= end) {
      ctx.save();
      if (!verticalMode) {
        // 水平模式：垂直紅線
        const playbackX = ((pb - start) / visibleSamples) * width;
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playbackX, 0);
        ctx.lineTo(playbackX, height);
        ctx.stroke();
        
        // 上下三角形指示器
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(playbackX, 0);
        ctx.lineTo(playbackX - 6, 10);
        ctx.lineTo(playbackX + 6, 10);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(playbackX, height);
        ctx.lineTo(playbackX - 6, height - 10);
        ctx.lineTo(playbackX + 6, height - 10);
        ctx.closePath();
        ctx.fill();
        
        // 時間浮標
        try {
          const effRate = sourceSampleRate / Math.max(1, decimationFactor);
          if (effRate > 0) {
            const absSeconds = pb / effRate;
            const labelTxt = absSeconds.toFixed(absSeconds >= 10 ? 2 : 3) + 's';
            const padX = 6, padY = 3;
            ctx.font = '11px -apple-system,Segoe UI,sans-serif';
            const textW = ctx.measureText(labelTxt).width;
            const boxW = textW + padX * 2;
            const boxH = 16;
            const boxX = Math.min(Math.max(playbackX - boxW / 2, 2), width - boxW - 2);
            const boxY = 2;
            
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(boxX, boxY, boxW, boxH, 4);
            } else {
              ctx.rect(boxX, boxY, boxW, boxH);
            }
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#c00';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelTxt, boxX + boxW / 2, boxY + boxH / 2);
          }
        } catch(e) {}
      } else {
        // 垂直模式：水平紅線
        const playbackY = ((pb - start) / visibleSamples) * height;
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, playbackY);
        ctx.lineTo(width, playbackY);
        ctx.stroke();
        
        // 左右三角形指示器
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(0, playbackY);
        ctx.lineTo(10, playbackY - 6);
        ctx.lineTo(10, playbackY + 6);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(width, playbackY);
        ctx.lineTo(width - 10, playbackY - 6);
        ctx.lineTo(width - 10, playbackY + 6);
        ctx.closePath();
        ctx.fill();
        
        // 時間浮標（右側）
        try {
          const effRateV = sourceSampleRate / Math.max(1, decimationFactor);
          if (effRateV > 0) {
            const absSecV = pb / effRateV;
            const labelTxtV = absSecV.toFixed(absSecV >= 10 ? 2 : 3) + 's';
            ctx.font = '11px -apple-system,Segoe UI,sans-serif';
            const tW = ctx.measureText(labelTxtV).width;
            const padXv = 6, padYv = 3;
            const boxWv = tW + padXv * 2;
            const boxHv = 16;
            const boxXv = width - boxWv - 2;
            const boxYv = Math.min(Math.max(playbackY - boxHv / 2, 2), height - boxHv - 2);
            
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(boxXv, boxYv, boxWv, boxHv, 4);
            } else {
              ctx.rect(boxXv, boxYv, boxWv, boxHv);
            }
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#c00';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelTxtV, boxXv + boxWv / 2, boxYv + boxHv / 2);
          }
        } catch(e) {}
      }
      ctx.restore();
    }
  }

  // 回報細緻度供主執行緒顯示
  try { self.postMessage({ type: 'detailUpdate', detail, density: densityR }); } catch(e){}

  // Also render overview if provided
  if (overviewCtx) {
    drawOverview({
      viewStart,
      visibleSamples,
      playbackPosition: params.playbackPosition
    });
  }
}

function drawOverview(params){
  const total = sampleMin.length;
  clearOverview();
  if (!total) return;
  const isVertical = verticalMode;
  const ctxO = overviewCtx;
  const w = overviewWidth;
  const h = overviewHeight;
  // time ticks
  try {
    const effRate = sourceSampleRate/Math.max(1,decimationFactor);
    if (effRate > 0){
      const totalSecs = total/effRate;
      const targetTicks = 8;
      const niceSteps = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,30,60,120,300,600];
      let step = niceSteps[0];
      for (let si=0; si<niceSteps.length; si++){ const s=niceSteps[si]; if ((totalSecs/s) <= targetTicks){ step=s; break; } }
      ctxO.save();
      ctxO.strokeStyle='rgba(0,0,0,0.06)'; ctxO.lineWidth=1; ctxO.fillStyle='#555';
      ctxO.textAlign = isVertical? 'left':'center';
      ctxO.textBaseline = isVertical? 'middle':'top';
      let last = -1e9;
      const dynamicGap = Math.max(28, Math.min(80, Math.round((isVertical?h:w)/Math.max(6, Math.min(12, totalSecs/step)))));
      const minGap = dynamicGap;
      const fontPx = Math.max(10, Math.min(13, Math.round((isVertical?w:h)/28)));
      ctxO.font = fontPx + 'px -apple-system,Segoe UI,sans-serif';
      for (let t=0; t<= totalSecs + 1e-6; t+= step){
        const ratio = t/totalSecs;
        if (!isVertical){
          const x = Math.round(ratio * w) + 0.5; ctxO.beginPath(); ctxO.moveTo(x,0); ctxO.lineTo(x,h); ctxO.stroke();
          const label = t.toFixed(step>=1?0:(step>=0.1?1:2))+'s';
          if (x - last >= minGap){ ctxO.fillText(label, x, 2); last = x; }
        } else {
          const y = Math.round(ratio * h) + 0.5; ctxO.beginPath(); ctxO.moveTo(0,y); ctxO.lineTo(w,y); ctxO.stroke();
          const labelV = t.toFixed(step>=1?0:(step>=0.1?1:2))+'s';
          if (y - last >= minGap){ ctxO.fillText(labelV, 4, y); last = y; }
        }
      }
      ctxO.restore();
    }
  } catch(e){}
  // overview waveform
  ctxO.strokeStyle = '#9E9E9E'; ctxO.lineWidth = 1; ctxO.beginPath();
  const spp = total/(isVertical?h:w);
  if (!isVertical){
    for (let x=0; x<w; x++){
      const rs = x*spp; const re = rs + spp;
      let sIdx = Math.floor(rs); let eIdx = Math.min(Math.floor(re), total-1); if (eIdx < sIdx) eIdx = sIdx;
      let mn=1, mx=-1; for (let i=sIdx;i<=eIdx;i++){ if (sampleMin[i] < mn) mn = sampleMin[i]; if (sampleMax[i] > mx) mx = sampleMax[i]; }
      if (mn > mx) continue;
      const off=(mx+mn)/2; const aMax = Math.max(-1, Math.min(1, mx-off)); const aMin = Math.max(-1, Math.min(1, mn-off));
      const yTop = (h/2) - aMax*(h/2)*0.9; const yBottom = (h/2) - aMin*(h/2)*0.9;
      ctxO.moveTo(x+0.5,yTop); ctxO.lineTo(x+0.5,yBottom);
    }
  } else {
    for (let y=0; y<h; y++){
      const rs = y*spp; const re = rs + spp;
      let sIdx = Math.floor(rs); let eIdx = Math.min(Math.floor(re), total-1); if (eIdx < sIdx) eIdx = sIdx;
      let mn=1, mx=-1; for (let i=sIdx;i<=eIdx;i++){ if (sampleMin[i] < mn) mn = sampleMin[i]; if (sampleMax[i] > mx) mx = sampleMax[i]; }
      if (mn > mx) continue;
      const off=(mx+mn)/2; const aMax = Math.max(-1, Math.min(1, mx-off)); const aMin = Math.max(-1, Math.min(1, mn-off));
      const xLeft = (w/2) + aMin*(w/2)*0.9; const xRight = (w/2) + aMax*(w/2)*0.9;
      ctxO.moveTo(xLeft,y+0.5); ctxO.lineTo(xRight,y+0.5);
    }
  }
  ctxO.stroke();
  // window indicator
  const viewStart = params.viewStart || 0; const visible = params.visibleSamples || 0;
  if (visible > 0){
    ctxO.save(); ctxO.fillStyle='rgba(30,136,229,0.2)'; ctxO.strokeStyle='#1E88E5'; ctxO.lineWidth=2;
    if (!isVertical){
      const x = (viewStart/total)*w; const ww = (visible/total)*w; ctxO.fillRect(x,0,ww,h); ctxO.strokeRect(x,0,ww,h);
    } else {
      const y = (viewStart/total)*h; const hh = (visible/total)*h; ctxO.fillRect(0,y,w,hh); ctxO.strokeRect(0,y,w,hh);
    }
    ctxO.restore();
  }
  // playback position line
  const pb = params.playbackPosition;
  if (typeof pb === 'number' && pb >= 0 && pb <= total){
    ctxO.save(); ctxO.strokeStyle='#FF0000'; ctxO.lineWidth=2;
    if (!isVertical){ const x = (pb/total)*w; ctxO.beginPath(); ctxO.moveTo(x+0.5,0); ctxO.lineTo(x+0.5,h); ctxO.stroke(); }
    else { const y = (pb/total)*h; ctxO.beginPath(); ctxO.moveTo(0,y+0.5); ctxO.lineTo(w,y+0.5); ctxO.stroke(); }
    ctxO.restore();
  }
}

self.onmessage = function(e){
  const msg = e.data;
  if (!msg) return;
  switch(msg.type){
    case 'init':
      offscreen = msg.canvas; ctx = offscreen.getContext('2d');
      width = msg.width; height = msg.height; verticalMode = !!msg.verticalMode; showClipMarks = !!msg.showClipMarks;
      sourceSampleRate = msg.sourceSampleRate || sourceSampleRate;
      decimationFactor = msg.decimationFactor || decimationFactor;
      clearCanvas();
      break;
    case 'resizeOverview':
      if (overviewOffscreen) {
        overviewOffscreen.width = msg.width|0; overviewOffscreen.height = msg.height|0; overviewWidth = overviewOffscreen.width; overviewHeight = overviewOffscreen.height; clearOverview();
      }
      break;
    case 'initOverview':
      overviewOffscreen = msg.canvas; overviewCtx = overviewOffscreen.getContext('2d');
      overviewWidth = msg.width; overviewHeight = msg.height; clearOverview();
      break;
    case 'append':
      appendBlocks(msg.minBlocks, msg.maxBlocks);
      break;
    case 'draw':
      verticalMode = !!msg.verticalMode; showClipMarks = !!msg.showClipMarks;
      draw(msg);
      break;
    case 'reset':
      sampleMin = []; sampleMax = []; clearCanvas(); clearOverview();
      break;
    case 'resizeCanvas':
      try {
        if (offscreen) {
          offscreen.width = (msg.width|0);
          offscreen.height = (msg.height|0);
          width = offscreen.width; height = offscreen.height;
          clearCanvas();
        }
      } catch(e) {}
      break;
  }
};
