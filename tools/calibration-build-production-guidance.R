# Robo Rally calibration production-guidance exporter
#
# Run this interactively in Positron after calibration-model-selection.json has
# been regenerated. Edit the two paths below if your project layout differs.
#
# Dependency: jsonlite only.
#
# This script is intentionally deterministic. It encodes the current production
# model-selection policy and fails if future evidence invalidates important
# assumptions, rather than silently keeping stale choices.

input_file <- "calibration/calibration-model-selection.json"
output_file <- "calibration/construction-guidance.json"

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("This exporter requires the R package 'jsonlite'.")
}

`%||%` <- function(left, right) if (is.null(left)) right else left

analysis <- jsonlite::fromJSON(input_file, simplifyVector = FALSE)

if (!identical(analysis$analysis, "construction-guidance-v3-model-selection")) {
  stop(
    "Unexpected calibration analysis type: ",
    analysis$analysis %||% "<missing>",
    ". Review the exporter before using a different analysis schema."
  )
}

find_named <- function(items, name, label) {
  matches <- Filter(function(item) identical(item$name, name), items %||% list())
  if (length(matches) != 1L) {
    stop("Expected exactly one ", label, " candidate named '", name, "'.")
  }
  matches[[1]]
}

num <- function(value, label) {
  result <- suppressWarnings(as.numeric(value))
  if (length(result) != 1L || !is.finite(result)) {
    stop("Expected finite numeric value for ", label, ".")
  }
  result
}

get_credible_held_out_improvement <- function(
  candidate,
  label,
  min_relative_rmse_gain = 0.02,
  tolerance = 1e-9
) {
  candidate_rmse <- num(
    candidate$heldOut$aggregate$rmse,
    paste0(label, " RMSE")
  )
  matched_baseline_rmse <- num(
    candidate$heldOut$baseline$rmse,
    paste0(label, " matched baseline RMSE")
  )
  candidate_mae <- num(
    candidate$heldOut$aggregate$mae,
    paste0(label, " MAE")
  )
  matched_baseline_mae <- num(
    candidate$heldOut$baseline$mae,
    paste0(label, " matched baseline MAE")
  )

  folds <- candidate$heldOut$folds %||% list()
  fold_count <- length(folds)
  fold_rmse_wins <- sum(vapply(
    folds,
    function(fold) {
      fold_rmse <- suppressWarnings(as.numeric(fold$rmse))
      baseline_rmse <- suppressWarnings(as.numeric(fold$baselineRmse))
      length(fold_rmse) == 1L &&
        length(baseline_rmse) == 1L &&
        is.finite(fold_rmse) &&
        is.finite(baseline_rmse) &&
        fold_rmse + tolerance < baseline_rmse
    },
    logical(1)
  ))
  required_fold_wins <- if (fold_count > 0L) ceiling(fold_count / 2) else Inf
  relative_rmse_gain <- if (matched_baseline_rmse > 0) {
    (matched_baseline_rmse - candidate_rmse) / matched_baseline_rmse
  } else {
    -Inf
  }

  list(
    credible = is.finite(relative_rmse_gain) &&
      relative_rmse_gain + tolerance >= min_relative_rmse_gain &&
      candidate_mae <= matched_baseline_mae + tolerance &&
      fold_rmse_wins >= required_fold_wins,
    candidateRmse = candidate_rmse,
    baselineRmse = matched_baseline_rmse,
    relativeRmseGain = relative_rmse_gain,
    candidateMae = candidate_mae,
    baselineMae = matched_baseline_mae,
    foldRmseWins = fold_rmse_wins,
    foldCount = fold_count,
    requiredFoldWins = required_fold_wins
  )
}

assert_context_does_not_beat_matched_baseline <- function(candidates, label, tolerance = 1e-9) {
  usable <- Filter(function(item) identical(item$heldOut$status, "ok"), candidates %||% list())
  if (!length(usable)) return(invisible(NULL))
  for (candidate in usable) {
    if (identical(candidate$name, "constant")) next
    evidence <- get_credible_held_out_improvement(
      candidate,
      paste0(label, " ", candidate$name),
      tolerance = tolerance
    )
    if (evidence$credible) {
      stop(
        label, ": candidate '", candidate$name,
        "' now shows a credible held-out improvement over its matched-row constant baseline ",
        "(RMSE ", signif(evidence$candidateRmse, 6), " vs ", signif(evidence$baselineRmse, 6),
        "; relative gain ", signif(100 * evidence$relativeRmseGain, 4), "%",
        "; MAE ", signif(evidence$candidateMae, 6), " vs ", signif(evidence$baselineMae, 6),
        "; RMSE fold wins ", evidence$foldRmseWins, "/", evidence$foldCount,
        "). Revisit production model selection before exporting."
      )
    }
  }
  invisible(NULL)
}

assert_piece_identity_does_not_beat_matched_baseline <- function(piece_block, outcome, tolerance = 1e-9) {
  candidates <- piece_block[[outcome]] %||% list()
  piece_only <- Filter(function(item) identical(item$name, "pieceOnly"), candidates)
  if (length(piece_only) != 1L) return(invisible(NULL))
  candidate <- piece_only[[1]]
  # Insufficient held-out support cannot justify a richer production treatment.
  # Retain the simple prior rather than failing the exporter.
  if (!identical(candidate$heldOut$status, "ok")) return(invisible(NULL))
  evidence <- get_credible_held_out_improvement(
    candidate,
    paste0("piece ", outcome, " pieceOnly"),
    tolerance = tolerance
  )
  if (evidence$credible) {
    stop(
      "Single-overlay piece identity now shows a credible held-out improvement for ", outcome,
      " over its matched-row constant baseline (RMSE ", signif(evidence$candidateRmse, 6),
      " vs ", signif(evidence$baselineRmse, 6),
      "; relative gain ", signif(100 * evidence$relativeRmseGain, 4), "%",
      "; MAE ", signif(evidence$candidateMae, 6), " vs ", signif(evidence$baselineMae, 6),
      "; RMSE fold wins ", evidence$foldRmseWins, "/", evidence$foldCount,
      "). Revisit production model selection before exporting."
    )
  }
  invisible(NULL)
}

normal_selection <- analysis$modelSelection$normal
treatment_selection <- analysis$modelSelection$treatments

assert_promoted_context_candidate <- function(candidates, selected_name, label, tolerance = 1e-9) {
  selected <- find_named(candidates, selected_name, label)
  evidence <- get_credible_held_out_improvement(
    selected,
    paste0(label, " ", selected_name),
    tolerance = tolerance
  )
  if (!evidence$credible) {
    stop(
      label, ": promoted candidate '", selected_name,
      "' no longer clears the contextual-treatment guardrail."
    )
  }

  usable <- Filter(function(item) {
    !identical(item$name, "constant") && identical(item$heldOut$status, "ok")
  }, candidates %||% list())
  for (candidate in usable) {
    candidate_evidence <- get_credible_held_out_improvement(
      candidate,
      paste0(label, " ", candidate$name),
      tolerance = tolerance
    )
    if (
      candidate_evidence$credible &&
      candidate_evidence$candidateRmse + tolerance < evidence$candidateRmse
    ) {
      stop(
        label, ": candidate '", candidate$name,
        "' now has lower held-out RMSE than promoted candidate '", selected_name,
        "'. Revisit production model selection."
      )
    }
  }
  selected
}

# v47 treatment decisions:
# - Dynamic Archiving length promotes the full checkpoint-context model.
# - Structural board-overlay route work promotes overlayCountGeometry.
# - All other treatment outcomes remain simple priors unless future evidence
#   independently clears the same guardrail.
dynamic_archiving_length_selected <- assert_promoted_context_candidate(
  treatment_selection$dynamicArchiving$length,
  "full",
  "Dynamic Archiving length"
)
overlay_route_cost_selected <- assert_promoted_context_candidate(
  treatment_selection$structuralBoardOverlay$routeCostLogRatio,
  "overlayCountGeometry",
  "Structural board overlay routeCostLogRatio"
)

for (outcome in c("difficulty", "routeCostLogRatio")) {
  assert_context_does_not_beat_matched_baseline(
    treatment_selection$dynamicArchiving[[outcome]],
    paste0("Dynamic Archiving ", outcome)
  )
}
for (outcome in c("length", "difficulty")) {
  assert_context_does_not_beat_matched_baseline(
    treatment_selection$structuralBoardOverlay[[outcome]],
    paste0("Structural board overlay ", outcome)
  )
}

piece_block <- treatment_selection$structuralBoardOverlay$singleOverlayPieceIdentity
for (outcome in c("length", "difficulty", "routeCostLogRatio")) {
  assert_piece_identity_does_not_beat_matched_baseline(piece_block, outcome)
}

selection_name_by_stage <- list(
  countsKnown = "countsPhysical",
  boardsKnown = "boardsPhysical",
  checkpointsKnown = "checkpointsHybridPhysical"
)

make_linear_bundle <- function(stage, outcome, target_transform) {
  source_model <- analysis$models$normal[[stage]][[outcome]]
  if (is.null(source_model) || !identical(source_model$status, "ok")) {
    stop("Missing usable source model for ", stage, " / ", outcome, ".")
  }

  candidate_name <- selection_name_by_stage[[stage]]
  selected <- find_named(
    normal_selection[[outcome]],
    candidate_name,
    paste0(stage, " ", outcome)
  )

  if (!identical(source_model$formula, selected$formula)) {
    stop(
      "Formula mismatch for ", stage, " / ", outcome,
      ". Source model and selected held-out candidate no longer match."
    )
  }

  held_out <- selected$heldOut
  aggregate <- held_out$aggregate

  list(
    type = "linear",
    targetTransform = target_transform,
    formula = source_model$formula,
    coefficients = source_model$coefficients,
    factorLevels = source_model$factorLevels,
    evidence = list(
      sampleSize = aggregate$sampleSize,
      heldOutRmse = aggregate$rmse,
      heldOutMae = aggregate$mae,
      heldOutRSquared = aggregate$rSquared,
      outOfFoldResidualSpread = held_out$residualSpread
    )
  )
}

make_stage <- function(stage) {
  list(
    length = make_linear_bundle(stage, "length", "identity"),
    difficulty = make_linear_bundle(stage, "difficulty", "identity"),
    routeCost = make_linear_bundle(stage, "routeCost", "log1p")
  )
}

make_treatment_linear_bundle <- function(source_model, selected, stage, target_transform, label) {
  if (is.null(source_model) || !identical(source_model$status, "ok")) {
    stop("Missing usable fitted treatment source model for ", label, ".")
  }
  if (!identical(source_model$formula, selected$formula)) {
    stop("Formula mismatch between fitted source and held-out selection for ", label, ".")
  }

  held_out <- selected$heldOut
  aggregate <- held_out$aggregate
  list(
    stage = stage,
    type = "linear",
    targetTransform = target_transform,
    formula = source_model$formula,
    coefficients = source_model$coefficients,
    factorLevels = source_model$factorLevels,
    evidence = list(
      sampleSize = aggregate$sampleSize,
      heldOutRmse = aggregate$rmse,
      heldOutMae = aggregate$mae,
      heldOutRSquared = aggregate$rSquared,
      outOfFoldResidualSpread = held_out$residualSpread
    )
  )
}

dynamic_archiving_length_context_model <- make_treatment_linear_bundle(
  analysis$models$treatments$dynamicArchiving$length,
  dynamic_archiving_length_selected,
  "checkpointsKnown",
  "identity",
  "Dynamic Archiving length"
)

overlay_route_cost_context_model <- make_treatment_linear_bundle(
  analysis$models$treatments$structuralBoardOverlay$routeCostLogRatio,
  overlay_route_cost_selected,
  "checkpointsKnown",
  "identity",
  "structural board overlay route-cost log ratio"
)

structural_model <- analysis$models$normal$countsKnown$structuralSuccess
structural_selected <- find_named(
  normal_selection$structuralSuccess,
  "countsPhysical",
  "counts-known structural-success"
)

if (!identical(structural_model$formula, structural_selected$formula)) {
  stop("Counts-known structural-success source/selection formulas no longer match.")
}

structural_held_out <- structural_selected$heldOut
structural_aggregate <- structural_held_out$aggregate
structural_baseline <- structural_held_out$baseline

paired_recovery <- analysis$summaries$pairedRecovery
paired_overlay <- analysis$summaries$pairedOverlayRemoval

production <- list(
  schemaVersion = 2,
  calibration = "robo-rally-construction-guidance-production-v2",

  source = list(
    analysis = analysis$analysis,
    generatedAt = analysis$generatedAt,
    observations = analysis$coverage$observations,
    modelEligibleObservations = analysis$coverage$modelEligibleObservations
  ),

  policy = list(
    guidanceOnly = TRUE,
    routeLegalityAuthority = FALSE,
    bandAuthority = FALSE,
    convergencePredictorEnabled = FALSE,
    predictorSelection = "selected target-free physical models only; checkpoint static distances use Manhattan fallback plus missingness; full model-selection analysis remains diagnostic",
    modeUse = "share one learned landscape; generation mode changes trust/exploration, not semantics",
    structuralSuccessUse = "soft prioritization only; not a hard rejection gate",
    routeCostUse = "soft work-risk guidance with full checkpoint-stage coverage; never classify work-budget abort or missing static topology as route impossibility",
    treatmentUse = paste(
      "contextual checkpoint-known treatment models are used only where held-out evidence clears",
      "the promotion guardrail; earlier stages and unpromoted outcomes retain simple priors;",
      "all treatment effects remain guidance-only"
    )
  ),

  domain = list(
    players = analysis$coverage$players,
    requestedBoardCounts = analysis$coverage$requestedBoardCounts,
    requestedFlagCounts = analysis$coverage$requestedFlagCounts,
    difficulties = analysis$coverage$difficulties,
    lengths = analysis$coverage$lengths,
    inventoryPresets = analysis$coverage$inventoryPresets
  ),

  normalLandscape = list(
    countsKnown = make_stage("countsKnown"),
    boardsKnown = make_stage("boardsKnown"),
    checkpointsKnown = make_stage("checkpointsKnown")
  ),

  structuralSuccessPrior = list(
    stage = "countsKnown",
    type = "logistic",
    applicability = paste(
      "baseline construction prioritization; suppress as a hard signal for",
      "structural-board-overlay and other poorly calibrated structural variants"
    ),
    formula = structural_model$formula,
    coefficients = structural_model$coefficients,
    factorLevels = structural_model$factorLevels,
    evidence = list(
      sampleSize = structural_aggregate$sampleSize,
      actualRate = structural_aggregate$actualRate,
      predictedRate = structural_aggregate$predictedRate,
      heldOutBrier = structural_aggregate$brier,
      baselineBrier = structural_baseline$brier,
      predictedRange = structural_held_out$predictedRange,
      calibrationBins = structural_held_out$calibrationBins
    )
  ),

  treatments = list(
    dynamicArchiving = list(
      policy = paste(
        "constant treatment priors remain for counts/boards-known and for difficulty;",
        "checkpoint-known length uses the promoted full contextual paired-effect model"
      ),
      lengthEffectMean = paired_recovery$lengthEffectMean,
      lengthEffectMedian = paired_recovery$lengthEffectMedian,
      lengthEffectP10 = paired_recovery$lengthEffectP10,
      lengthEffectP90 = paired_recovery$lengthEffectP90,
      difficultyEffectMean = paired_recovery$difficultyEffectMean,
      difficultyEffectMedian = paired_recovery$difficultyEffectMedian,
      difficultyEffectP10 = paired_recovery$difficultyEffectP10,
      difficultyEffectP90 = paired_recovery$difficultyEffectP90,
      contextualModelEnabled = TRUE,
      lengthContextStage = "checkpointsKnown",
      lengthContextModel = dynamic_archiving_length_context_model
    ),

    structuralBoardOverlay = list(
      policy = paste(
        "no direct length/difficulty offset; checkpoint-known route-work uses the promoted",
        "overlay-count-plus-geometry log-ratio model; piece identity remains unpromoted"
      ),
      lengthDifficultyOffsetEnabled = FALSE,
      analysisWorkPrior = list(
        medianExpansionIncrease = paired_overlay$expansionEffectMedian,
        medianExpansionRatio = paired_overlay$sourceToPairedExpansionRatioMedian,
        p90ExpansionRatio = paired_overlay$sourceToPairedExpansionRatioP90,
        contextualModelEnabled = TRUE,
        contextualStage = "checkpointsKnown",
        logRatioContextModel = overlay_route_cost_context_model,
        overlayCountSpecificEnabled = FALSE,
        pieceIdentityEnabled = FALSE
      )
    )
  ),

  uncertaintyNotes = list(
    countsDifficulty = "weak-to-moderate prior only",
    checkpointLength = "strong guidance",
    checkpointDifficulty = "useful but materially noisy",
    routeCost = "use for prioritization/work-risk, not precise budgeting; inspect analysis diagnostics.routeWorkTail for raw-space tail underprediction",
    structuralSuccess = paste(
      "counts prior has value but low-probability calibration bins are sparse;",
      "never hard-reject from it"
    )
  )
)

dir.create(dirname(output_file), recursive = TRUE, showWarnings = FALSE)

jsonlite::write_json(
  production,
  output_file,
  pretty = TRUE,
  auto_unbox = TRUE,
  null = "null",
  na = "null",
  digits = 10
)

cat("Production calibration guidance written to:\n", output_file, "\n", sep = "")
