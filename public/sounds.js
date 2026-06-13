// 8-bit Audio Engine using Web Audio API

const AudioFX = (function() {
  let audioCtx = null;

  function initCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, vol = 0.1, sweepMultiplier = 1) {
    try {
      initCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (sweepMultiplier !== 1) {
        osc.frequency.exponentialRampToValueAtTime(freq * sweepMultiplier, audioCtx.currentTime + duration);
      }

      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Audio error", e);
    }
  }

  return {
    playClick: function() {
      // Short, high-pitched blip
      playTone(800, 'square', 0.05, 0.05);
    },
    
    playCoin: function() {
      // Classic B5 to E6 chime
      initCtx();
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        
        osc.frequency.setValueAtTime(987.77, audioCtx.currentTime); // B5
        osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.1); // E6
        
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch(e) {}
    },
    
    playHurt: function() {
      // Low descending buzz
      playTone(150, 'sawtooth', 0.3, 0.15, 0.5);
    },

    playJump: function() {
      // Ascending frequency sweep
      playTone(400, 'square', 0.3, 0.1, 2.5); // Sweeps up
    }
  };
})();

// Attach click sound to all buttons automatically when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  document.body.addEventListener('click', (e) => {
    // Check if the clicked element or its parent is a button
    const btn = e.target.closest('button');
    if (btn) {
      // Don't play default click if the button has specific onclick handlers for score 
      // (we will handle those manually)
      const onclickAttr = btn.getAttribute('onclick') || '';
      if (!onclickAttr.includes('addScore')) {
        AudioFX.playClick();
      }
    }
  });
});
