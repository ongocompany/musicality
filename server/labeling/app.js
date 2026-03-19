/**
 * Musicality Section Labeling Tool
 * Wavesurfer.js v7 + Regions plugin
 */

import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js';
import RegionsPlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.esm.js';
import TimelinePlugin from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/timeline.esm.js';

// ─── Constants ────────────────────────────────────────────────
const API_BASE = window.location.origin;

const SECTION_COLORS = {
  intro:   { bg: 'rgba(79, 195, 247, 0.25)',   border: '#4FC3F7' },
  derecho: { bg: 'rgba(102, 187, 106, 0.25)',  border: '#66BB6A' },
  majao:   { bg: 'rgba(255, 167, 38, 0.25)',   border: '#FFA726' },
  mambo:   { bg: 'rgba(239, 83, 80, 0.25)',    border: '#EF5350' },
  bridge:  { bg: 'rgba(171, 71, 188, 0.25)',   border: '#AB47BC' },
  outro:   { bg: 'rgba(120, 144, 156, 0.25)',  border: '#78909C' },
};

const LABELS = ['intro', 'derecho', 'majao', 'mambo', 'bridge', 'outro'];
const LABEL_KEYS = { '1': 'intro', '2': 'derecho', '3': 'majao', '4': 'mambo', '5': 'bridge', '6': 'outro' };

// ─── State ────────────────────────────────────────────────────
let wavesurfer = null;
let regions = null;
let currentTrackId = null;
let currentTrackData = null;
let selectedRegion = null;
let autoSections = [];
let isDirty = false;
let beats = [];       // beat timestamps from analysis
let downbeats = [];   // downbeat (beat 1) timestamps
const SNAP_THRESHOLD = 0.15; // snap within 150ms of a beat

// ─── DOM Elements ─────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const fileInput = $('#file-input');
const uploadLabel = $('#upload-label');
const tracksContainer = $('#tracks-container');
const trackCount = $('#track-count');
const statsContent = $('#stats-content');
const emptyState = $('#empty-state');
const loading = $('#loading');
const loadingText = $('#loading-text');

// ─── Initialize ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupUpload();
  setupKeyboard();
  setupLabelButtons();
  setupTransport();
  loadTracks();
  loadStats();
});

// ─── Wavesurfer Setup ─────────────────────────────────────────
function initWavesurfer(audioUrl) {
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  regions = RegionsPlugin.create();

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#555',
    progressColor: '#BB86FC',
    cursorColor: '#BB86FC',
    cursorWidth: 2,
    height: 'auto',
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    url: audioUrl,
    plugins: [
      regions,
      TimelinePlugin.create({
        container: '#timeline',
        primaryLabelInterval: 10,
        secondaryLabelInterval: 5,
        style: { fontSize: '11px', color: '#888' },
      }),
    ],
  });

  wavesurfer.on('ready', () => {
    $('#total-time').textContent = formatTime(wavesurfer.getDuration());
  });

  wavesurfer.on('timeupdate', (time) => {
    $('#current-time').textContent = formatTime(time);
  });

  wavesurfer.on('play', () => {
    $('#btn-play').textContent = '⏸';
  });

  wavesurfer.on('pause', () => {
    $('#btn-play').textContent = '▶';
  });

  // Region events
  regions.on('region-clicked', (region, e) => {
    e.stopPropagation();
    selectRegion(region);
  });

  regions.on('region-updated', (region) => {
    // Snap to nearest beat
    const snappedStart = snapToBeat(region.start);
    const snappedEnd = snapToBeat(region.end);
    if (snappedStart !== region.start || snappedEnd !== region.end) {
      region.setOptions({ start: snappedStart, end: snappedEnd });
    }
    isDirty = true;
    updateSaveStatus();
    if (selectedRegion && selectedRegion.id === region.id) {
      updateRegionInfo(region);
    }
  });

  // Click on waveform → deselect region
  wavesurfer.on('click', () => {
    deselectRegion();
  });
}

// ─── Region Management ────────────────────────────────────────
function addRegionsFromSections(sections) {
  if (!regions) return;
  regions.clearRegions();
  selectedRegion = null;
  updateRegionPanel();

  for (const s of sections) {
    const label = s.label || 'derecho';
    const colors = SECTION_COLORS[label] || SECTION_COLORS.derecho;
    regions.addRegion({
      start: s.start_time,
      end: s.end_time,
      color: colors.bg,
      content: label.toUpperCase(),
      drag: true,
      resize: true,
      id: `region_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    });
  }
}

function selectRegion(region) {
  // Deselect previous
  if (selectedRegion) {
    selectedRegion.setOptions({ color: getRegionColor(getRegionLabel(selectedRegion)).bg });
  }

  selectedRegion = region;
  const label = getRegionLabel(region);

  // Highlight selected
  const colors = SECTION_COLORS[label] || SECTION_COLORS.derecho;
  region.setOptions({
    color: colors.bg.replace('0.25', '0.45'),
  });

  updateRegionInfo(region);
  highlightLabelButton(label);
}

function deselectRegion() {
  if (selectedRegion) {
    const label = getRegionLabel(selectedRegion);
    selectedRegion.setOptions({ color: getRegionColor(label).bg });
    selectedRegion = null;
  }
  updateRegionPanel();
  highlightLabelButton(null);
}

function getRegionLabel(region) {
  const content = region.content;
  if (typeof content === 'string') {
    return content.toLowerCase();
  }
  if (content && content.textContent) {
    return content.textContent.toLowerCase();
  }
  return 'derecho';
}

function getRegionColor(label) {
  return SECTION_COLORS[label] || SECTION_COLORS.derecho;
}

function changeRegionLabel(region, newLabel) {
  const colors = SECTION_COLORS[newLabel];
  region.setOptions({
    color: colors.bg.replace('0.25', '0.45'),
    content: newLabel.toUpperCase(),
  });
  isDirty = true;
  updateSaveStatus();
  updateRegionInfo(region);
  highlightLabelButton(newLabel);
}

function deleteSelectedRegion() {
  if (!selectedRegion) return;

  const allRegions = getSortedRegions();
  const idx = allRegions.findIndex(r => r.id === selectedRegion.id);

  if (allRegions.length <= 1) return; // Don't delete the last region

  // Expand neighbor to fill the gap
  if (idx > 0) {
    allRegions[idx - 1].setOptions({ end: selectedRegion.end });
  } else if (idx < allRegions.length - 1) {
    allRegions[idx + 1].setOptions({ start: selectedRegion.start });
  }

  selectedRegion.remove();
  selectedRegion = null;
  isDirty = true;
  updateSaveStatus();
  updateRegionPanel();
  highlightLabelButton(null);
}

function addBoundaryAtCursor() {
  if (!wavesurfer || !regions) return;

  const cursorTime = snapToBeat(wavesurfer.getCurrentTime());
  const allRegions = getSortedRegions();

  // Find which region the cursor is in
  const containing = allRegions.find(r => cursorTime >= r.start && cursorTime <= r.end);
  if (!containing || cursorTime - containing.start < 1 || containing.end - cursorTime < 1) return;

  const label = getRegionLabel(containing);
  const colors = SECTION_COLORS[label];

  // Split: shrink current region, add new one
  const originalEnd = containing.end;
  containing.setOptions({ end: cursorTime });

  regions.addRegion({
    start: cursorTime,
    end: originalEnd,
    color: colors.bg,
    content: label.toUpperCase(),
    drag: true,
    resize: true,
    id: `region_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });

  isDirty = true;
  updateSaveStatus();
}

function getSortedRegions() {
  return regions.getRegions().sort((a, b) => a.start - b.start);
}

// ─── Beat Snap ─────────────────────────────────────────────
function snapToBeat(time) {
  if (beats.length === 0) return time;
  let closest = beats[0];
  let minDist = Math.abs(time - closest);
  for (let i = 1; i < beats.length; i++) {
    const dist = Math.abs(time - beats[i]);
    if (dist < minDist) {
      minDist = dist;
      closest = beats[i];
    }
    if (beats[i] > time + SNAP_THRESHOLD) break; // early exit
  }
  return minDist <= SNAP_THRESHOLD ? closest : time;
}

// ─── UI Updates ───────────────────────────────────────────────
function updateRegionInfo(region) {
  const info = $('#selected-region-info');
  info.classList.remove('hidden');
  const label = getRegionLabel(region);
  $('#region-label-display').textContent = label.toUpperCase();
  $('#region-label-display').style.color = SECTION_COLORS[label]?.border || '#E0E0E0';
  $('#region-time-display').textContent =
    `${formatTime(region.start)} - ${formatTime(region.end)} (${(region.end - region.start).toFixed(1)}s)`;
}

function updateRegionPanel() {
  if (!selectedRegion) {
    $('#selected-region-info').classList.add('hidden');
  }
}

function highlightLabelButton(activeLabel) {
  document.querySelectorAll('.label-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.label === activeLabel);
  });
}

function updateSaveStatus() {
  $('#save-status').textContent = isDirty ? '(unsaved changes)' : 'Saved';
  $('#save-status').style.color = isDirty ? '#FFA726' : '#66BB6A';
}

function showUI() {
  emptyState.classList.add('hidden');
  $('#track-info').classList.remove('hidden');
  $('#waveform-container').classList.remove('hidden');
  $('#section-editor').classList.remove('hidden');
  $('#transport').classList.remove('hidden');
}

function showLoading(text) {
  loadingText.textContent = text;
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Upload ───────────────────────────────────────────────────
function setupUpload() {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadFile(e.target.files[0]);
  });

  // Drag & drop
  uploadLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadLabel.classList.add('drag-over');
  });

  uploadLabel.addEventListener('dragleave', () => {
    uploadLabel.classList.remove('drag-over');
  });

  uploadLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadLabel.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });

  // Also handle drop on main area
  const main = $('#main');
  main.addEventListener('dragover', (e) => e.preventDefault());
  main.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  });
}

async function uploadFile(file) {
  showLoading(`Uploading & analyzing "${file.name}"...`);

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^.]+$/, ''));

    const res = await fetch(`${API_BASE}/labels/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Upload failed');
    }

    const data = await res.json();
    loadTrack(data);
    loadTracks(); // Refresh sidebar
    loadStats();

  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideLoading();
    fileInput.value = '';
  }
}

// ─── Track Loading ────────────────────────────────────────────
function loadTrack(data) {
  currentTrackId = data.track_id || data.id;
  currentTrackData = data;
  autoSections = data.auto_sections || [];
  beats = data.beats || [];
  downbeats = data.downbeats || [];

  // Update track info bar
  $('#track-title').textContent = data.title;
  $('#track-bpm').textContent = `${Math.round(data.bpm)} BPM`;
  $('#track-duration').textContent = formatTime(data.duration);

  showUI();

  // Init wavesurfer with audio
  initWavesurfer(data.audio_url);

  wavesurfer.on('ready', () => {
    // Load user labels if available, otherwise auto sections
    const sections = data.user_labels?.length > 0 ? data.user_labels : data.auto_sections;
    if (sections?.length > 0) {
      addRegionsFromSections(sections);
    }
    isDirty = false;
    updateSaveStatus();
  });

  // Highlight active track in sidebar
  document.querySelectorAll('.track-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === currentTrackId);
  });
}

async function loadTrackById(trackId) {
  showLoading('Loading track...');
  try {
    const res = await fetch(`${API_BASE}/labels/tracks/${trackId}`);
    if (!res.ok) throw new Error('Failed to load track');
    const data = await res.json();
    loadTrack(data);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ─── Track List ───────────────────────────────────────────────
async function loadTracks() {
  try {
    const res = await fetch(`${API_BASE}/labels/tracks`);
    if (!res.ok) return;
    const tracks = await res.json();

    trackCount.textContent = `(${tracks.length})`;
    tracksContainer.innerHTML = '';

    for (const t of tracks) {
      const div = document.createElement('div');
      div.className = `track-item${t.id === currentTrackId ? ' active' : ''}`;
      div.dataset.id = t.id;
      div.innerHTML = `
        <div class="track-name">${t.title}</div>
        <div class="track-meta">
          ${Math.round(t.bpm)} BPM &middot; ${formatTime(t.duration)}
          <span class="label-status ${t.has_labels ? 'labeled' : 'unlabeled'}">
            ${t.has_labels ? 'Labeled' : 'Unlabeled'}
          </span>
        </div>
      `;
      div.addEventListener('click', () => loadTrackById(t.id));
      tracksContainer.appendChild(div);
    }
  } catch (err) {
    console.error('Failed to load tracks:', err);
  }
}

// ─── Stats ────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/labels/stats`);
    if (!res.ok) return;
    const stats = await res.json();

    statsContent.innerHTML = `
      Total: <strong>${stats.total_tracks}</strong> tracks<br>
      Labeled: <strong>${stats.labeled_tracks}</strong><br>
      Unlabeled: <strong>${stats.unlabeled_tracks}</strong>
    `;
  } catch (err) {
    statsContent.textContent = 'Could not load stats';
  }
}

// ─── Save ─────────────────────────────────────────────────────
async function saveLabels() {
  if (!currentTrackId || !regions) return;

  const allRegions = getSortedRegions();
  const sections = allRegions.map(r => ({
    label: getRegionLabel(r),
    start_time: Math.round(r.start * 1000) / 1000,
    end_time: Math.round(r.end * 1000) / 1000,
  }));

  showLoading('Saving labels...');
  try {
    const res = await fetch(`${API_BASE}/labels/tracks/${currentTrackId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections,
        labeler_id: 'expert',
        source: 'web_tool',
      }),
    });

    if (!res.ok) throw new Error('Save failed');

    isDirty = false;
    updateSaveStatus();
    loadTracks(); // Refresh label status
    loadStats();
  } catch (err) {
    alert(`Save error: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ─── Label Buttons ────────────────────────────────────────────
function setupLabelButtons() {
  document.querySelectorAll('.label-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedRegion) {
        changeRegionLabel(selectedRegion, btn.dataset.label);
      }
    });
  });

  $('#delete-region-btn').addEventListener('click', deleteSelectedRegion);
}

// ─── Transport Controls ───────────────────────────────────────
function setupTransport() {
  $('#btn-play').addEventListener('click', () => {
    if (wavesurfer) wavesurfer.playPause();
  });

  $('#btn-back').addEventListener('click', () => {
    if (wavesurfer) wavesurfer.skip(-5);
  });

  $('#btn-forward').addEventListener('click', () => {
    if (wavesurfer) wavesurfer.skip(5);
  });

  $('#btn-add-boundary').addEventListener('click', addBoundaryAtCursor);

  $('#btn-save').addEventListener('click', saveLabels);
}

// ─── Keyboard Shortcuts ──────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (wavesurfer) wavesurfer.playPause();
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (wavesurfer) wavesurfer.skip(-5);
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (wavesurfer) wavesurfer.skip(5);
        break;

      case 'KeyB':
        e.preventDefault();
        addBoundaryAtCursor();
        break;

      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        deleteSelectedRegion();
        break;

      case 'KeyS':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          saveLabels();
        }
        break;

      // Number keys 1-6 → change label
      default:
        if (LABEL_KEYS[e.key] && selectedRegion) {
          e.preventDefault();
          changeRegionLabel(selectedRegion, LABEL_KEYS[e.key]);
        }
        break;
    }
  });
}
