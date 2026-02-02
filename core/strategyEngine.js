const applyEliteSalesHeuristic = require('./applyEliteSalesHeuristic');

function strategyEngine(state, scores = {}, history = []) {
  const heuristics = applyEliteSalesHeuristic({ state, scores, history });

  if (heuristics.staySilent) {
    return { mode: 'SILENT' };
  }

  if (heuristics.beDirect && heuristics.askQualification) {
    return {
      mode: 'DIRECT',
      goal: 'QUALIFY',
      verbosity: 'LOW'
    };
  }

  if (heuristics.createUrgency) {
    return {
      mode: 'FIRM',
      goal: 'MOVE_FORWARD',
      verbosity: 'LOW'
    };
  }

  return {
    mode: 'NEUTRAL',
    goal: 'ENGAGE',
    verbosity: 'MEDIUM'
  };
}

module.exports = strategyEngine;
