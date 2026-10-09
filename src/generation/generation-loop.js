// Robo Rally Course Randomizer - generation loop: candidate attempts, acceptance and selection, the production entry point, diagnostics cases
import {
  ANALYZE_BUILD_ID,
  clearAnalysisCaches,
  getAnalysisTelemetrySnapshot
} from "../../analyze.js";
import { buildCourseNotesHtml } from "../../course-notes.js";
import { createRandomCandidate } from "./candidate-builder.js";
import {
  chooseNearBestCandidate,
  getAcceptableScenarioScore,
  getFallbackScenarioScore,
  getNearBestCandidateBin,
  isViableFallbackScenario
} from "./candidate-selection.js";
import {
  DIAGNOSTIC_DIFFICULTIES,
  DIAGNOSTIC_LENGTHS,
  DIAGNOSTIC_PLAYER_COUNTS,
  GENERATION_EMERGENCY_ATTEMPT_RESERVE,
  NORMAL_FULL_COURSE_TRAFFIC_PASSES,
  NORMAL_PRUNE_BATCH_SIZE,
  NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
  NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
  OVERLAY_UPDATE_INTERVAL,
  SOFT_CANDIDATE_RETENTION_LIMIT
} from "./config.js";
import { rememberDevAcceptableCandidatePool } from "./dev-replay.js";
import {
  compactGenerationStage,
  describeGenerationRejection,
  summarizeGenerationRejectionEvents,
  summarizeRouteSearchDelta
} from "./diagnostics.js";
import {
  isDevFastAlternatesEnabled,
  isDevFastTrafficEnabled,
  isDevRouteModelOverrideActive,
  isDevViewEnabled
} from "./environment.js";
import {
  formatGenerationModeLabel,
  getGenerationModeProfile,
  normalizeGenerationMode
} from "./generation-modes.js";
import { evaluateFinishedCourse } from "./persistence.js";
import { resolveAnyPreferencesForGeneration } from "./preferences.js";
import { withGenerationRandomSeed } from "./random.js";
import {
  GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS,
  formatCooperativeRouteProgressStage,
  generationNow,
  nextEventLoopTurn,
  nextFrame
} from "./scheduling.js";

export async function generateScenarioForPreferences(assets, preferences, options = {}) {
  const generationMode = normalizeGenerationMode(preferences.generationMode);
  const generationProfile = getGenerationModeProfile({ generationMode });
  const acceptableCandidateTarget = Math.max(1, Math.floor(
    Number(options.acceptableCandidateTarget ?? generationProfile.acceptableCandidateTarget) || 1
  ));
  const maxAttempts = options.maxAttempts ?? generationProfile.maxAttempts;
  const emergencyAttemptReserve = Math.max(0, Math.floor(
    Number(options.emergencyAttemptReserve) || 0
  ));
  const effectiveMaxAttempts = maxAttempts + emergencyAttemptReserve;
  const softExpansionBudget = options.softExpansionBudget ?? generationProfile.softExpansionBudget;
  const softBudgetMinAttempts = options.softBudgetMinAttempts ?? generationProfile.softBudgetMinAttempts;
  const onProgress = options.onProgress ?? null;
  const onCooperativeProgress = typeof options.onCooperativeProgress === "function"
    ? options.onCooperativeProgress
    : null;
  const onRetainableCandidate = typeof options.onRetainableCandidate === "function"
    ? options.onRetainableCandidate
    : null;
  const shouldStopRequested = typeof options.shouldStopRequested === "function"
    ? options.shouldStopRequested
    : () => false;
  const generationStartedAt = generationNow();
  const generationDiagnostics = {
    startedAt: generationStartedAt,
    attempts: [],
    totalMs: 0,
    totalEvaluations: 0,
    routeSearches: 0,
    routeExpansions: 0,
    routeSearchMs: 0,
    contextualProfileDurationMs: 0,
    cappedRouteSearches: 0,
    slowestRouteSearch: null,
    routeSearchTotalsByKind: null,
    physicalCacheTotals: null,
    dynamicArchivePhysicalCacheTotals: null,
    cheapProgramAvailabilityTotals: null,
    cheapProgramUnionAvailabilityTotals: null,
    contextualProfileTotals: null,
    terminationReason: null,
    rejectionEvents: [],
    rejectionSummary: null,
    generationMode,
    generationModeLabel: formatGenerationModeLabel(generationMode),
    acceptableCandidateTarget,
    acceptableCandidatesFound: 0,
    acceptableCandidateScores: [],
    nearBestCandidateScores: [],
    nearBestCandidateCutoff: null,
    selectedCandidateScore: null,
    softCandidateRetentionLimit: SOFT_CANDIDATE_RETENTION_LIMIT,
    maxAttempts,
    emergencyAttemptReserve,
    emergencyActivated: false,
    emergencyAttemptsUsed: 0,
    softExpansionBudget,
    softBudgetMinAttempts,
    searchProfile: {
      preflightOpeningExpansions: generationProfile.preflightOpeningExpansions,
      preflightLaterExpansions: generationProfile.preflightLaterExpansions,
      lightStartExpansions: generationProfile.lightStartExpansions,
      fullCourseExpansions: generationProfile.fullCourseExpansions,
      primaryWitnessRoutes: generationProfile.primaryWitnessRoutes,
      trafficEnabled: generationProfile.trafficEnabled,
      trafficEpochs: generationProfile.trafficEpochs,
      trafficAlternateDemandThreshold: NORMAL_TRAFFIC_ALTERNATE_DEMAND_THRESHOLD,
      trafficAlternateMinGain: NORMAL_TRAFFIC_ALTERNATE_MIN_GAIN,
      trafficAlternateMaxNewSearchesPerEpoch:
        generationProfile.trafficAlternateMaxNewSearchesPerEpoch,
      trafficAlternateMaxNewSearchesTotal:
        generationProfile.trafficAlternateMaxNewSearchesTotal,
      trafficAlternateExpansions: generationProfile.trafficAlternateExpansions,
      trafficAlternateMaxActions: generationProfile.trafficAlternateMaxActions,
      trafficAlternateCachedProbeMargin: generationProfile.trafficAlternateCachedProbeMargin,
      trafficAlternateCachedProbeMaxSimilarity: generationProfile.trafficAlternateCachedProbeMaxSimilarity,
      trafficAlternateLegsPerStart: generationProfile.trafficAlternateLegsPerStart,
      trafficExplorationUncertaintyShare: generationProfile.trafficExplorationUncertaintyShare,
      trafficExplorationConfidenceFloor: generationProfile.trafficExplorationConfidenceFloor,
      trafficAlternateUncertaintyEffortFloor: generationProfile.trafficAlternateUncertaintyEffortFloor,
      trafficAlternateUncertaintyEffortExponent: generationProfile.trafficAlternateUncertaintyEffortExponent,
      normalPruneBatchSize: NORMAL_PRUNE_BATCH_SIZE,
      normalPruneBatchPolicy: "adaptive-2-above-2x-players-else-1",
      fullCourseTrafficPasses: NORMAL_FULL_COURSE_TRAFFIC_PASSES
    }
  };
  // v35a: diagnostics live in this owning scope. Dev View itself is observational;
  // only the explicit current-mode override changes route-model behavior. Snapshot
  // that override here so copied summaries describe the experiment actually run.
  const diagnosticsDevRouteModelOverrideActive = isDevRouteModelOverrideActive();
  const diagnosticsEffectiveTrafficEnabled = diagnosticsDevRouteModelOverrideActive
    ? isDevFastTrafficEnabled()
    : Boolean(generationProfile.trafficEnabled);
  const diagnosticsEffectiveTrafficFeedbackEnabled = Boolean(
    diagnosticsEffectiveTrafficEnabled && generationProfile.trafficEpochs > 0
  );
  const diagnosticsEffectiveTrafficDrivenAlternates = Boolean(
    diagnosticsEffectiveTrafficFeedbackEnabled && (
      diagnosticsDevRouteModelOverrideActive ? isDevFastAlternatesEnabled() : true
    )
  );
  generationDiagnostics.searchProfile.trafficEnabled = diagnosticsEffectiveTrafficEnabled;
  generationDiagnostics.searchProfile.trafficEpochs = diagnosticsEffectiveTrafficFeedbackEnabled
    ? generationProfile.trafficEpochs
    : 0;
  generationDiagnostics.searchProfile.trafficAlternatesEnabled =
    diagnosticsEffectiveTrafficDrivenAlternates;
  generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesPerEpoch =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficAlternateMaxNewSearchesPerEpoch
      : 0;
  generationDiagnostics.searchProfile.trafficAlternateMaxNewSearchesTotal =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficAlternateMaxNewSearchesTotal
      : 0;
  generationDiagnostics.searchProfile.trafficAlternateExpansions =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateExpansions : 0;
  generationDiagnostics.searchProfile.trafficAlternateMaxActions =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateMaxActions : 0;
  generationDiagnostics.searchProfile.trafficAlternateCachedProbeMargin =
    diagnosticsEffectiveTrafficDrivenAlternates ? generationProfile.trafficAlternateCachedProbeMargin : 0;
  generationDiagnostics.searchProfile.trafficAlternateCachedProbeMaxSimilarity =
    generationProfile.trafficAlternateCachedProbeMaxSimilarity;
  generationDiagnostics.searchProfile.trafficExplorationUncertaintyShare =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficExplorationUncertaintyShare
      : 0;
  generationDiagnostics.searchProfile.trafficExplorationConfidenceFloor =
    diagnosticsEffectiveTrafficDrivenAlternates
      ? generationProfile.trafficExplorationConfidenceFloor
      : 1;
  generationDiagnostics.searchProfile.devRouteModelOverrideActive =
    diagnosticsDevRouteModelOverrideActive;
  // v48zj: one card-transition memo context per Generate run. It dies with this
  // generation and is partitioned inside analyze.js by the explicit card-rule
  // signature, so separate rule semantics never share cached transitions.
  const estimatedCardTransitionMemoContext = { byRuleSignature: new Map() };
  const acceptableCandidates = [];
  let bestAcceptableScenario = null;
  let bestAcceptableScore = Infinity;
  let bestScenario = null;
  generationDiagnostics.finalEvaluations = [];
  // The final evaluation reports progress like any other generation stage, which
  // also gives the page regular turns while the chosen course is re-analysed.
  // Overlay updates are throttled exactly like generation's own route progress:
  // on phones every DOM update and repaint is costly, and the search yields many
  // times per second.
  let lastFinalEvaluationProgressAt = 0;
  let finalEvaluationTickerStep = 0;
  const finalEvaluationControl = {
    shouldStopRequested,
    onStage: async (stage) => {
      if (onProgress) await onProgress(attempt, maxAttempts, `Final evaluation — ${stage}`);
      else await nextEventLoopTurn();
    },
    onCooperativeProgress: async (progress) => {
      const now = generationNow();
      if (
        onCooperativeProgress &&
        now - lastFinalEvaluationProgressAt >= GENERATION_ROUTE_PROGRESS_DISPLAY_INTERVAL_MS
      ) {
        lastFinalEvaluationProgressAt = now;
        onCooperativeProgress(
          attempt,
          maxAttempts,
          `Final evaluation — ${formatCooperativeRouteProgressStage(progress, finalEvaluationTickerStep)}`
        );
        finalEvaluationTickerStep += 1;
        await nextFrame();
      } else {
        await nextEventLoopTurn();
      }
    }
  };

  // Every complete candidate is evaluated from its routed field before it is
  // judged (the numbers a reload reproduces), so acceptance, ranking and the
  // fallback all use the numbers the player will see. Returns the evaluated
  // course, or null when its presentation cannot be rebuilt (a reload of it
  // would fail too). A stop request skips the evaluation so Stop stays prompt;
  // the candidate then keeps its generation-time numbers.
  async function evaluateCandidate(candidate) {
    if (shouldStopRequested()) return candidate;
    const startedAt = generationNow();
    let evaluated = null;
    try {
      evaluated = await evaluateFinishedCourse(assets, candidate, preferences, finalEvaluationControl);
    } catch (error) {
      if (error?.code === "ANALYSIS_STOP_REQUESTED" && shouldStopRequested()) return candidate;
      throw error;
    }
    generationDiagnostics.finalEvaluations.push({
      attempt: candidate.attempts ?? null,
      complete: Boolean(evaluated),
      acceptable: Boolean(evaluated?.metrics?.acceptable),
      generationDifficultyTurnRE: candidate.metrics?.difficultyTurnRE ?? null,
      finalDifficultyTurnRE: evaluated?.metrics?.difficultyTurnRE ?? null,
      elapsedMs: Number((generationNow() - startedAt).toFixed(2))
    });
    return evaluated;
  }

  // Picks the course for the player from the acceptable pool: { choice, scenario }.
  function chooseAcceptableCandidate() {
    if (!acceptableCandidates.length) return null;
    const choice = chooseNearBestCandidate(acceptableCandidates);
    return { choice, scenario: choice.scenario ?? bestAcceptableScenario ?? acceptableCandidates[0] };
  }
  let bestExtraDocksNearMissScenario = null;
  let crashedAttempts = 0;
  let lastAttemptError = null;
  let attempt = 0;
  let terminationReason = null;
  let emergencyActivated = false;

  const attachDiagnostics = (scenario) => {
    if (!scenario) return scenario;
    const telemetry = getAnalysisTelemetrySnapshot();
    generationDiagnostics.totalMs = Number((generationNow() - generationStartedAt).toFixed(2));
    generationDiagnostics.totalEvaluations = attempt;
    generationDiagnostics.emergencyActivated = emergencyActivated;
    generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    generationDiagnostics.routeSearches = telemetry.routeSearchCount ?? 0;
    generationDiagnostics.routeExpansions = telemetry.totalExpansions ?? 0;
    generationDiagnostics.routeSearchMs = telemetry.totalDurationMs ?? 0;
    generationDiagnostics.contextualProfileDurationMs =
      telemetry.contextualProfileDurationMs ?? 0;
    generationDiagnostics.cappedRouteSearches = telemetry.cappedSearches ?? 0;
    generationDiagnostics.slowestRouteSearch = telemetry.slowestSearch ?? null;
    generationDiagnostics.routeSearchTotalsByKind = telemetry.totalsByKind ?? null;
    generationDiagnostics.analyzeBuildId = ANALYZE_BUILD_ID;
    generationDiagnostics.physicalCacheTotals = telemetry.physicalCacheTotals ?? null;
    generationDiagnostics.dynamicArchivePhysicalCacheTotals =
      telemetry.dynamicArchivePhysicalCacheTotals ?? null;
    generationDiagnostics.cheapProgramAvailabilityTotals =
      telemetry.cheapProgramAvailabilityTotals ?? null;
    generationDiagnostics.cheapProgramUnionAvailabilityTotals =
      telemetry.cheapProgramUnionAvailabilityTotals ?? null;
    generationDiagnostics.contextualProfileTotals = telemetry.contextualProfileTotals ?? null;
    generationDiagnostics.exhaustiveContextualProfileTotals =
      telemetry.exhaustiveContextualProfileTotals ?? null;
    generationDiagnostics.resumeTotals = telemetry.resumeTotals ?? null;
    generationDiagnostics.cooperativeSearchTotals =
      telemetry.cooperativeSearchTotals ?? null;
    generationDiagnostics.cooperativeIteratorTotals =
      telemetry.cooperativeIteratorTotals ?? null;
    generationDiagnostics.terminationReason = terminationReason;
    generationDiagnostics.rejectionSummary = summarizeGenerationRejectionEvents(
      generationDiagnostics.rejectionEvents
    );
    generationDiagnostics.acceptableCandidatesFound = acceptableCandidates.length;
    generationDiagnostics.acceptableCandidateScores = acceptableCandidates.map((candidate) => (
      Number(getAcceptableScenarioScore(candidate).toFixed(2))
    ));
    const nearBestBin = getNearBestCandidateBin(acceptableCandidates);
    generationDiagnostics.nearBestCandidateScores = nearBestBin.pool.map((entry) => (
      Number(entry.score.toFixed(2))
    ));
    generationDiagnostics.nearBestCandidateCutoff = Number.isFinite(nearBestBin.cutoff)
      ? Number(nearBestBin.cutoff.toFixed(2))
      : null;
    scenario.generationDiagnostics = {
      ...generationDiagnostics,
      attempts: generationDiagnostics.attempts.map((entry) => ({
        ...entry,
        stages: (entry.stages || []).map((stage) => ({ ...stage })),
        slowestRouteSearch: entry.slowestRouteSearch
          ? { ...entry.slowestRouteSearch }
          : null,
        routeSearchTotalsByKind: entry.routeSearchTotalsByKind
          ? Object.fromEntries(Object.entries(entry.routeSearchTotalsByKind).map(([kind, bucket]) => [kind, { ...bucket }]))
          : null,
        contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null
      })),
      rejectionEvents: generationDiagnostics.rejectionEvents.map((entry) => ({
        ...entry,
        contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null,
        routeSearchTotalsByKind: entry.routeSearchTotalsByKind
          ? Object.fromEntries(Object.entries(entry.routeSearchTotalsByKind).map(([kind, bucket]) => [kind, { ...bucket }]))
          : null
      })),
      rejectionSummary: generationDiagnostics.rejectionSummary
        ? {
          ...generationDiagnostics.rejectionSummary,
          categories: generationDiagnostics.rejectionSummary.categories.map((entry) => ({
            ...entry,
            contextualProfile: entry.contextualProfile ? { ...entry.contextualProfile } : null
          }))
        }
        : null
    };
    return scenario;
  };

  while (attempt < effectiveMaxAttempts) {
    if (shouldStopRequested()) {
      terminationReason = "user-best-so-far";
      break;
    }

    if (attempt >= maxAttempts) {
      if (bestScenario || emergencyAttemptReserve <= 0) {
        terminationReason = "attempt-limit";
        break;
      }
      emergencyActivated = true;
      generationDiagnostics.emergencyActivated = true;
      generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    }

    const progressMaxAttempts = emergencyActivated ? effectiveMaxAttempts : maxAttempts;
    const workSnapshot = getAnalysisTelemetrySnapshot();
    // The minimum-attempt guard protects against settling for a poor fallback;
    // once an acceptable course exists, the work allowance alone decides.
    const softBudgetReached = (
      (attempt >= softBudgetMinAttempts || acceptableCandidates.length > 0) &&
      bestScenario &&
      (workSnapshot.totalExpansions ?? 0) >= softExpansionBudget
    );
    if (softBudgetReached) {
      terminationReason = "soft-expansion-budget";
      break;
    }

    const remainingAttempts = progressMaxAttempts - attempt;
    const attemptLabel = attempt + 1;
    const candidateStartedAt = generationNow();
    const telemetryBefore = getAnalysisTelemetrySnapshot();
    const stageTimings = [];
    let lastStage = emergencyActivated
      ? "Finding a fallback course — no playable candidate yet"
      : "Setting up a new candidate";
    let stageStartedAt = candidateStartedAt;

    const recordStageBoundary = (nextStage) => {
      const now = generationNow();
      if (lastStage) {
        stageTimings.push({
          stage: compactGenerationStage(lastStage),
          ms: Number((now - stageStartedAt).toFixed(2))
        });
      }
      lastStage = nextStage;
      stageStartedAt = now;
    };

    if (onProgress) {
      await onProgress(attemptLabel, progressMaxAttempts, lastStage);
    }

    let result;
    try {
      result = await createRandomCandidate(
        assets,
        preferences,
        attemptLabel,
        remainingAttempts,
        async (localEvaluations) => {
          if (!onProgress || localEvaluations <= 1) {
            return;
          }
          const visibleAttempt = Math.min(progressMaxAttempts, attempt + localEvaluations);
          await onProgress(
            visibleAttempt,
            progressMaxAttempts,
            emergencyActivated
              ? "Finding a fallback course — trying another checkpoint layout"
              : "Trying another checkpoint layout on this board"
          );
        },
        async (stage, localEvaluations = 1, stageContext = null) => {
          recordStageBoundary(stage);
          if (!onProgress) {
            return;
          }
          const visibleAttempt = Math.min(progressMaxAttempts, attempt + Math.max(1, localEvaluations));
          await onProgress(visibleAttempt, progressMaxAttempts, stage, stageContext);
        },
        ({ evaluationsUsed: localEvaluations, bestScenario: candidateBestScenario }) => {
          if (shouldStopRequested()) {
            return true;
          }
          const completedEvaluations = attempt + Math.max(0, localEvaluations);
          if (completedEvaluations < softBudgetMinAttempts) {
            return false;
          }
          if (!bestScenario && !isViableFallbackScenario(candidateBestScenario)) {
            return false;
          }
          const work = getAnalysisTelemetrySnapshot();
          return (work.totalExpansions ?? 0) >= softExpansionBudget;
        },
        shouldStopRequested,
        onCooperativeProgress
          ? (stage, localEvaluations = 1, stageContext = null) => {
            const visibleAttempt = Math.min(
              progressMaxAttempts,
              attempt + Math.max(1, localEvaluations)
            );
            onCooperativeProgress(
              visibleAttempt,
              progressMaxAttempts,
              stage,
              stageContext
            );
          }
          : null,
        estimatedCardTransitionMemoContext,
        () => acceptableCandidates.length > 0
      );
    } catch (error) {
      if (error?.code === "ANALYSIS_STOP_REQUESTED" && shouldStopRequested()) {
        recordStageBoundary("Stopped");
        terminationReason = "user-best-so-far";
        break;
      }
      const overRouteWorkBudget = error?.code === "CANDIDATE_ROUTE_WORK_BUDGET_EXCEEDED";
      recordStageBoundary(overRouteWorkBudget ? "Over route-work budget" : "Crashed");
      if (!overRouteWorkBudget) {
        crashedAttempts += 1;
        lastAttemptError = error;
      }
      attempt += 1;
      if (emergencyActivated) {
        generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
      }
      const telemetryAfter = getAnalysisTelemetrySnapshot();
      const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
      generationDiagnostics.attempts.push({
        startAttempt: attemptLabel,
        endAttempt: attemptLabel,
        evaluationsUsed: 1,
        elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
        outcome: overRouteWorkBudget ? "rejected" : "crashed",
        reason: error?.message ?? String(error),
        stages: stageTimings,
        routeSearches: routeDelta.searches,
        routeExpansions: routeDelta.expansions,
        routeSearchMs: routeDelta.durationMs,
        cappedRouteSearches: routeDelta.capped,
        slowestRouteSearch: routeDelta.slowest,
        routeSearchTotalsByKind: routeDelta.totalsByKind,
        contextualSearches: routeDelta.contextualSearches,
        contextualExpansions: routeDelta.contextualExpansions,
        contextualDurationMs: routeDelta.contextualDurationMs,
        contextualProfile: routeDelta.contextualProfile
      });
      generationDiagnostics.rejectionEvents.push({
        evaluation: attemptLabel,
        category: "crash",
        reason: error?.message ?? String(error),
        routeSearches: routeDelta.searches,
        routeExpansions: routeDelta.expansions,
        routeSearchMs: routeDelta.durationMs,
        cappedRouteSearches: routeDelta.capped,
        contextualSearches: routeDelta.contextualSearches,
        contextualExpansions: routeDelta.contextualExpansions,
        contextualDurationMs: routeDelta.contextualDurationMs,
        contextualProfile: routeDelta.contextualProfile
      });
      console.warn(`Attempt ${attemptLabel} failed during generation`, error);
      continue;
    }

    const evaluationsUsed = Math.max(1, result.evaluationsUsed ?? 1);
    attempt += evaluationsUsed;
    if (emergencyActivated) {
      generationDiagnostics.emergencyAttemptsUsed = Math.max(0, attempt - maxAttempts);
    }
    if (Array.isArray(result.rejectionEvents) && result.rejectionEvents.length) {
      generationDiagnostics.rejectionEvents.push(...result.rejectionEvents.map((entry) => ({
        ...entry,
        evaluation: attemptLabel + Math.max(0, (entry.evaluation ?? 1) - 1)
      })));
    }
    let scenario = result.scenario;
    const lastMeaningfulStage = lastStage;
    if (scenario) {
      scenario.attempts = attempt;
      recordStageBoundary("Final evaluation");
      scenario = await evaluateCandidate(scenario);
    }
    const extraDocksNearMissScenario = result.extraDocksNearMissScenario ?? null;
    if (extraDocksNearMissScenario) {
      const nearMissScore = getFallbackScenarioScore(extraDocksNearMissScenario);
      const bestNearMissScore = getFallbackScenarioScore(bestExtraDocksNearMissScenario);
      if (Number.isFinite(nearMissScore) && nearMissScore < bestNearMissScore) {
        bestExtraDocksNearMissScenario = extraDocksNearMissScenario;
      }
    }
    recordStageBoundary(scenario ? "Candidate complete" : "Candidate rejected");

    const telemetryAfter = getAnalysisTelemetrySnapshot();
    const routeDelta = summarizeRouteSearchDelta(telemetryBefore, telemetryAfter);
    const attemptRecord = {
      startAttempt: attemptLabel,
      endAttempt: attemptLabel + evaluationsUsed - 1,
      evaluationsUsed,
      elapsedMs: Number((generationNow() - candidateStartedAt).toFixed(2)),
      outcome: scenario?.metrics?.acceptable ? "accepted" : "rejected",
      reason: scenario?.metrics?.acceptable
        ? "accepted"
        : result.scenario && !scenario
          ? "final evaluation could not rebuild the course"
          : describeGenerationRejection(scenario, lastMeaningfulStage),
      stages: stageTimings,
      routeSearches: routeDelta.searches,
      routeExpansions: routeDelta.expansions,
      routeSearchMs: routeDelta.durationMs,
      cappedRouteSearches: routeDelta.capped,
      slowestRouteSearch: routeDelta.slowest,
      routeSearchTotalsByKind: routeDelta.totalsByKind,
      contextualSearches: routeDelta.contextualSearches,
      contextualExpansions: routeDelta.contextualExpansions,
      contextualDurationMs: routeDelta.contextualDurationMs,
      contextualProfile: routeDelta.contextualProfile
    };
    generationDiagnostics.attempts.push(attemptRecord);

    if (!scenario) {
      if (shouldStopRequested()) {
        terminationReason = "user-best-so-far";
        break;
      }
      continue;
    }

    scenario.attempts = attempt;

    const scenarioFallbackScore = getFallbackScenarioScore(scenario);
    const bestFallbackScore = getFallbackScenarioScore(bestScenario);
    if (Number.isFinite(scenarioFallbackScore) && scenarioFallbackScore < bestFallbackScore) {
      bestScenario = scenario;
    }

    if (scenario.metrics.acceptable) {
      const acceptableScore = getAcceptableScenarioScore(scenario);
      acceptableCandidates.push(scenario);
      generationDiagnostics.acceptableCandidatesFound = acceptableCandidates.length;
      generationDiagnostics.acceptableCandidateScores = acceptableCandidates.map((candidate) => (
        Number(getAcceptableScenarioScore(candidate).toFixed(2))
      ));
      if (acceptableScore < bestAcceptableScore) {
        bestAcceptableScenario = scenario;
        bestAcceptableScore = acceptableScore;
      }
      if (onRetainableCandidate) {
        await onRetainableCandidate({
          found: acceptableCandidates.length,
          target: acceptableCandidateTarget,
          bestScore: bestAcceptableScore
        });
      }
    }

    if (shouldStopRequested()) {
      terminationReason = "user-best-so-far";
      break;
    }

    const selection = acceptableCandidates.length >= acceptableCandidateTarget
      ? chooseAcceptableCandidate()
      : null;
    if (selection) {
      terminationReason = "accepted";
      const nearBestChoice = selection.choice;
      const selectedScenario = selection.scenario;
      generationDiagnostics.nearBestCandidateScores = nearBestChoice.pool.map((entry) => (
        Number(entry.score.toFixed(2))
      ));
      generationDiagnostics.nearBestCandidateCutoff = Number.isFinite(nearBestChoice.cutoff)
        ? Number(nearBestChoice.cutoff.toFixed(2))
        : null;
      generationDiagnostics.selectedCandidateScore = Number.isFinite(nearBestChoice.selectedScore)
        ? Number(nearBestChoice.selectedScore.toFixed(2))
        : Number(getAcceptableScenarioScore(selectedScenario).toFixed(2));
      selectedScenario.generationBestMatch = false;
      selectedScenario.generationTerminationReason = terminationReason;
      selectedScenario.attempts = attempt;
      if (isDevViewEnabled()) {
        rememberDevAcceptableCandidatePool(selectedScenario, acceptableCandidates);
      }
      attachDiagnostics(selectedScenario);
      return {
        scenario: selectedScenario,
        attemptsUsed: attempt,
        crashedAttempts,
        lastAttemptError,
        accepted: true,
        terminationReason,
        generationDiagnostics: selectedScenario.generationDiagnostics
      };
    }

    if (emergencyActivated && attempt > maxAttempts && bestScenario) {
      terminationReason = "emergency-fallback-found";
      break;
    }

    if (onProgress && attempt % OVERLAY_UPDATE_INTERVAL === 0) {
      await onProgress(
        attempt,
        progressMaxAttempts,
        emergencyActivated
          ? "Finding a fallback course — continuing the search"
          : "Continuing the candidate search"
      );
    }
  }

  if (!terminationReason) {
    terminationReason = attempt >= effectiveMaxAttempts
      ? (emergencyActivated ? "emergency-attempt-limit" : "attempt-limit")
      : "search-ended";
  }

  const finalSelection = acceptableCandidates.length
    ? chooseAcceptableCandidate()
    : null;
  if (finalSelection) {
    const nearBestChoice = finalSelection.choice;
    bestScenario = finalSelection.scenario;
    generationDiagnostics.nearBestCandidateScores = nearBestChoice.pool.map((entry) => (
      Number(entry.score.toFixed(2))
    ));
    generationDiagnostics.nearBestCandidateCutoff = Number.isFinite(nearBestChoice.cutoff)
      ? Number(nearBestChoice.cutoff.toFixed(2))
      : null;
    generationDiagnostics.selectedCandidateScore = Number.isFinite(nearBestChoice.selectedScore)
      ? Number(nearBestChoice.selectedScore.toFixed(2))
      : Number(getAcceptableScenarioScore(bestScenario).toFixed(2));
  }
  // v49fb: a user stop must not discard a completed returnable fallback merely
  // because no ordinarily acceptable candidate has been found yet. The same
  // bestScenario accumulated for attempt-limit / soft-budget fallback remains
  // authoritative here. If no completed fallback exists, bestScenario is still
  // null and the existing "No course found yet" behavior remains correct.

  // v49er: forced Extra Docks is a hard gate. One-dock near misses remain
  // diagnostic candidates only and are never promoted to a returned course.

  if (bestScenario) {
    bestScenario.generationBestMatch = !Boolean(bestScenario.metrics?.acceptable);
    bestScenario.generationTerminationReason = terminationReason;
    bestScenario.attempts = attempt;
  }
  if (bestScenario && acceptableCandidates.length && isDevViewEnabled()) {
    rememberDevAcceptableCandidatePool(bestScenario, acceptableCandidates);
  }
  attachDiagnostics(bestScenario);

  return {
    scenario: bestScenario,
    attemptsUsed: attempt,
    crashedAttempts,
    lastAttemptError,
    accepted: Boolean(bestScenario?.metrics?.acceptable),
    terminationReason,
    generationDiagnostics:
      bestScenario?.generationDiagnostics ?? generationDiagnostics
  };
}

export function detectScenarioExplanationIssues(scenario) {
  const issues = [];
  const explanationHtml = buildCourseNotesHtml(scenario, [], { includeDiagnostics: true });
  const checks = [
    {
      active: scenario.metrics.difficultyDirection === "high",
      tokens: ["softens the board pressure", "makes recovery cleaner"]
    },
    {
      active: scenario.metrics.difficultyDirection === "low",
      tokens: [
        "planning more demanding",
        "less forgiving",
        "harder to plan ahead",
        "reduces planning flexibility",
        "extra uncertainty"
      ]
    },
    {
      active: scenario.metrics.lengthDirection === "high",
      tokens: ["keeps turns moving", "trims some board friction"]
    },
    {
      active: scenario.metrics.lengthDirection === "low",
      tokens: ["add extra repositioning"]
    }
  ];

  checks.forEach((check) => {
    if (!check.active) {
      return;
    }
    check.tokens.forEach((token) => {
      if (explanationHtml.includes(token)) {
        issues.push(`note-contradiction:${token}`);
      }
    });
  });

  return issues;
}

export function buildDiagnosticsCases(basePreferences) {
  const cases = [];

  for (const playerCount of DIAGNOSTIC_PLAYER_COUNTS) {
    for (const difficulty of DIAGNOSTIC_DIFFICULTIES) {
      for (const length of DIAGNOSTIC_LENGTHS) {
        cases.push({
          label: `${playerCount}p ${difficulty} ${length}`,
          preferences: {
            ...basePreferences,
            playerCount,
            difficulty,
            length
          }
        });
      }
    }
  }

  return cases;
}

// Shared by the Generate button and the headless comparison harness, so both
// run the identical production path: cache reset, "Any" target resolution,
// optional seeded randomness, and the scenario bookkeeping applied afterward.
export async function runProductionGeneration(assets, preferences, options = {}) {
  const seed = Number.isInteger(options.seed) ? options.seed : null;
  const maxAttempts = options.maxAttempts ?? getGenerationModeProfile(preferences).maxAttempts;
  clearAnalysisCaches();
  let effectivePreferences = preferences;
  let anyTargetResolution = null;
  const runGeneration = () => {
    const resolved = resolveAnyPreferencesForGeneration(preferences);
    effectivePreferences = resolved.effectivePreferences;
    anyTargetResolution = resolved.resolution;
    return generateScenarioForPreferences(assets, effectivePreferences, {
      maxAttempts,
      emergencyAttemptReserve: GENERATION_EMERGENCY_ATTEMPT_RESERVE,
      ...(options.generationOptions ?? {})
    });
  };
  const generation = seed === null
    ? await runGeneration()
    : await withGenerationRandomSeed(seed, runGeneration);

  if (!generation.scenario) return generation;

  generation.scenario.effectiveTargetPreferences = {
    difficulty: effectivePreferences.difficulty,
    length: effectivePreferences.length
  };
  generation.scenario.preferences = {
    ...(generation.scenario.preferences ?? {}),
    difficulty: preferences.difficulty,
    length: preferences.length
  };
  if (anyTargetResolution && generation.scenario.generationDiagnostics) {
    generation.scenario.generationDiagnostics.anyTargetResolution = { ...anyTargetResolution };
  }

  if (seed !== null) {
    generation.scenario.devTestSeed = seed;
    // v49ce: do not run the v49cd 28k-expansion card-pressure experiment
    // automatically. Frozen-seed generation now ends when production analysis
    // ends; optional deep Dev diagnostics are user-invoked after render.
  }
  return generation;
}
