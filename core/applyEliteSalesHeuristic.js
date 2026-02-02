function applyEliteSalesHeuristic({ state, scores = {}, history = [] }) {
  const heuristics = {
    avoidEducation: false,
    beDirect: false,
    reduceOptions: false,
    askQualification: false,
    createUrgency: false,
    staySilent: false
  };

  if (state === 'objective' && scores.intentClarity > 6) {
    heuristics.avoidEducation = true;
    heuristics.beDirect = true;
  }

  if (scores.attentionScore < 4) {
    heuristics.beDirect = true;
  }

  if (scores.emotionScore > 7) {
    heuristics.reduceOptions = true;
    heuristics.createUrgency = true;
  }

  if (scores.attentionScore < 3) {
    heuristics.staySilent = true;
  }

  if (scores.intentClarity > 5 && !scores.isBuyerConfirmed) {
    heuristics.askQualification = true;
  }

  return heuristics;
}

module.exports = applyEliteSalesHeuristic;


