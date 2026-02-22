// core/silence.js

function silence(profile, awareness) {
  // Se o server passar um objeto em vez de strings, a gente trata
  const p = typeof profile === 'string' ? profile : (profile?.profile || 'PRAGMATIC');
  const a = typeof awareness === 'string' ? awareness : (profile?.awareness || 'NEUTRAL');

  const profileWeights = {
    PRAGMATIC: 500,
    ANALYTIC: 3000,
    EXPRESSIVE: 1500,
    AFFABLE: 2000
  };

  const awarenessWeights = {
    PROBLEM_AWARE: 1500, 
    SOLUTION_AWARE: 2000,
    DECISION_READY: 500,
    NEUTRAL: 1000
  };

  const baseDelay = (profileWeights[p] || 1000) + (awarenessWeights[a] || 1000);
  const finalDelay = baseDelay + Math.floor(Math.random() * 1000);

  console.log(`[SILENCE] Perfil: ${p} | Delay: ${finalDelay}ms`);
  
  return finalDelay;
}

// Isso faz com que 'silence' possa ser chamado como função direta
module.exports = silence;