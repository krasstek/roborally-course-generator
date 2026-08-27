# Robo Rally construction calibration model-selection analysis
#
# Run interactively in Positron. Edit input_files to include every calibration
# JSONL study that should contribute to the model-selection analysis. The script
# deliberately does not parse command-line arguments: keeping the input set
# explicit here makes a fresh calibration reduction reproducible and reviewable.
#
# R dependency: jsonlite only. Node collection remains dependency-free and offline.

input_files <- c(
  "calibration-output/calibration-v47z.jsonl"
)
output_file <- "calibration/calibration-model-selection.json"

input_files <- trimws(input_files)
input_files <- input_files[nzchar(input_files)]
if (!length(input_files)) stop("No calibration JSONL input files were supplied.")

if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("This analysis script requires the R package 'jsonlite'. Install it once, then the analysis can run offline.")
}

`%||%` <- function(left, right) if (is.null(left)) right else left

safe_num <- function(value) {
  if (is.null(value) || length(value) == 0) return(NA_real_)
  result <- suppressWarnings(as.numeric(value[[1]]))
  if (length(result) == 0 || !is.finite(result)) NA_real_ else result
}

safe_chr <- function(value) {
  if (is.null(value) || length(value) == 0) return(NA_character_)
  result <- as.character(value[[1]])
  if (!length(result) || is.na(result) || result == "") NA_character_ else result
}

safe_bool <- function(value) {
  if (is.null(value) || length(value) == 0) return(FALSE)
  isTRUE(value[[1]])
}

path_get <- function(object, ...) {
  keys <- list(...)
  current <- object
  for (key in keys) {
    if (is.null(current) || is.null(current[[key]])) return(NULL)
    current <- current[[key]]
  }
  current
}

structural_overlay_ids <- function(construction) {
  overlays <- construction$overlays %||% list()
  if (!length(overlays)) return(NA_character_)
  ids <- vapply(overlays, function(overlay) {
    kind <- safe_chr(overlay$kind)
    piece_id <- safe_chr(overlay$pieceId)
    if (!is.na(kind) && identical(kind, "board") && !is.na(piece_id)) piece_id else NA_character_
  }, character(1))
  ids <- sort(unique(ids[!is.na(ids) & nzchar(ids)]))
  if (!length(ids)) NA_character_ else paste(ids, collapse = "|")
}

overlay_id_present <- function(encoded_ids, piece_id) {
  if (is.na(encoded_ids) || !nzchar(encoded_ids)) return(FALSE)
  piece_id %in% strsplit(encoded_ids, "|", fixed = TRUE)[[1]]
}

q_safe <- function(values, probability) {
  values <- as.numeric(values)
  values <- values[is.finite(values)]
  if (!length(values)) return(NA_real_)
  unname(stats::quantile(values, probability, na.rm = TRUE))
}

mean_safe <- function(values) {
  values <- as.numeric(values)
  values <- values[is.finite(values)]
  if (!length(values)) NA_real_ else mean(values)
}

cor_safe <- function(left, right) {
  left <- as.numeric(left)
  right <- as.numeric(right)
  keep <- is.finite(left) & is.finite(right)
  if (sum(keep) < 10 || stats::sd(left[keep]) == 0 || stats::sd(right[keep]) == 0) return(NA_real_)
  stats::cor(left[keep], right[keep])
}

read_jsonl <- function(path) {
  lines <- readLines(path, warn = FALSE)
  lines <- lines[nzchar(trimws(lines))]
  lapply(seq_along(lines), function(index) {
    tryCatch(
      jsonlite::fromJSON(lines[[index]], simplifyVector = FALSE),
      error = function(error) stop("Invalid JSONL line ", index, ": ", conditionMessage(error))
    )
  })
}

records_by_file <- lapply(input_files, read_jsonl)
records <- unlist(records_by_file, recursive = FALSE)
headers <- Filter(function(record) identical(record$recordType, "run"), records)
observations <- Filter(function(record) identical(record$recordType, "observation"), records)
if (!length(headers)) stop("No run header found in: ", paste(input_files, collapse = ", "))
if (!length(observations)) stop("No observations found in: ", paste(input_files, collapse = ", "))
header <- headers[[1]]

observation_row <- function(record) {
  plan <- record$plan %||% list()
  evidence <- record$evidence %||% list()
  construction <- evidence$construction %||% list()
  outcome <- evidence$outcome
  layout <- construction$layout %||% list()
  profiles <- path_get(construction, "boardProfiles", "means") %||% list()
  shape <- construction$shape %||% list()
  hard_failures <- outcome$hardFailures %||% list()
  forced_variants <- plan$forcedVariantIds %||% list()
  variant_id <- if (length(forced_variants)) paste(unlist(forced_variants), collapse = "|") else "none"
  difficulty_fit <- safe_num(outcome$difficultyFit)
  length_fit <- safe_num(outcome$lengthFit)
  structural_success <- !is.null(outcome) && length(hard_failures) == 0
  target_hit <- structural_success && is.finite(difficulty_fit) && is.finite(length_fit) && difficulty_fit <= 0 && length_fit <= 0

  data.frame(
    run_id = safe_chr(record$runId),
    observation_index = safe_num(record$index),
    block_index = safe_num(record$blockIndex),
    slot_index = safe_num(record$slotIndex),
    stratum = safe_chr(record$stratum),
    study = safe_chr(plan$study),
    status = safe_chr(path_get(record, "generation", "status")),
    player_count = safe_num(plan$playerCount),
    requested_difficulty = safe_chr(plan$difficulty),
    requested_length = safe_chr(plan$length),
    requested_board_spread = if (identical(safe_chr(plan$boardSpread), "tight")) "tight" else "random",
    requested_board_count = safe_num(plan$boardCount),
    requested_flag_count = safe_num(plan$flagCount),
    checkpoint_sampling_regime = safe_chr(plan$checkpointSamplingRegime),
    inventory_preset = safe_chr(plan$inventoryPreset),
    forced_board_overlay_count = safe_num(plan$forcedBoardOverlayCount),
    variant_id = variant_id,
    guidance_strength = safe_num(plan$guidanceStrength),
    actual_board_count = safe_num(construction$boardCount),
    actual_flag_count = safe_num(construction$flagCount),
    structural_start_count = safe_num(construction$startCount),
    dock_count = safe_num(construction$dockCount),
    overlay_count = safe_num(construction$overlayCount),
    overlay_board_count = safe_num(construction$overlayBoardCount),
    overlay_tile_count = safe_num(construction$overlayTileCount),
    profile_overall = safe_num(profiles$overall),
    profile_hazard = safe_num(profiles$hazard),
    profile_congestion = safe_num(profiles$congestion),
    profile_complexity = safe_num(profiles$complexity),
    profile_swinginess = safe_num(profiles$swinginess),
    profile_density = safe_num(profiles$density),
    compactness = safe_num(layout$compactness),
    adjacency_count = safe_num(layout$adjacencyCount),
    shared_edge = safe_num(layout$sharedEdge),
    graph_diameter = safe_num(layout$graphDiameter),
    first_start_manhattan_mean = safe_num(shape$firstStartManhattanMean),
    first_start_static_mean = safe_num(shape$firstStartStaticMean),
    sequential_manhattan_sum = safe_num(shape$sequentialManhattanSum),
    sequential_static_sum = safe_num(shape$sequentialStaticSum),
    final_manhattan = safe_num(shape$finalManhattan),
    final_static_distance = safe_num(shape$finalStaticDistance),
    convergence_mean = safe_num(shape$convergenceMean),
    convergence_max = safe_num(shape$convergenceMax),
    board_depth_mean = safe_num(shape$boardDepthMean),
    board_depth_min = safe_num(shape$boardDepthMin),
    board_depth_max = safe_num(shape$boardDepthMax),
    represented_board_count = safe_num(shape$representedBoardCount),
    shallow_checkpoint_count = safe_num(shape$shallowCheckpointCount),
    scenario_available = !is.null(outcome),
    model_eligible = safe_chr(path_get(record, "generation", "status")) %in% c("scenario", "analyzed-rejection", "construction-rejection"),
    structural_success = structural_success,
    target_hit = target_hit,
    difficulty_raw = safe_num(outcome$difficultyRaw),
    length_raw = safe_num(outcome$lengthRaw),
    difficulty_fit = difficulty_fit,
    length_fit = length_fit,
    fit_score = safe_num(outcome$fitScore),
    reachable_starts = safe_num(outcome$reachableStarts),
    usable_starts = safe_num(outcome$usableStarts),
    opening_fastest_actions = safe_num(outcome$openingFastestActions),
    final_fastest_actions = safe_num(outcome$finalFastestActions),
    meaningful_board_use_penalty = safe_num(outcome$meaningfulBoardUsePenalty),
    traffic_average_penalty = safe_num(outcome$trafficAveragePenalty),
    route_searches = safe_num(path_get(record, "work", "routeSearchCount")),
    route_expansions = safe_num(path_get(record, "work", "totalExpansions")),
    capped_searches = safe_num(path_get(record, "work", "cappedSearches")),
    route_duration_ms = safe_num(path_get(record, "work", "totalDurationMs")),
    wall_elapsed_ms = safe_num(path_get(record, "generation", "elapsedMs")),
    hard_failure_count = length(hard_failures),
    stringsAsFactors = FALSE
  )
}

rows <- do.call(rbind, lapply(observations, observation_row))

factorize <- function(data) {
  data$player_factor <- factor(data$player_count)
  data$board_factor <- factor(data$requested_board_count)
  data$flag_factor <- factor(data$requested_flag_count)
  data$difficulty_factor <- factor(data$requested_difficulty, levels = c("easy", "moderate", "hard", "brutal"))
  data$length_factor <- factor(data$requested_length, levels = c("short", "moderate", "long", "epic"))
  data$board_spread_factor <- factor(data$requested_board_spread, levels = c("random", "tight"))
  data$inventory_factor <- factor(data$inventory_preset)
  data
}
rows <- factorize(rows)

# v47: requested difficulty/length are comparison targets, not intrinsic course
# predictors. The v46a study deliberately neutralized target-guided checkpoint
# sampling so raw outcomes can be learned from physical construction evidence.
# Static-topology distances can be unavailable on a small but important subset of
# exact-routable courses. Preserve those rows by falling back to the corresponding
# Manhattan distance and record the missingness explicitly instead of dropping the
# entire checkpoint-stage observation.
add_checkpoint_fallback_features <- function(data) {
  if (!nrow(data)) return(data)
  required <- c(
    "first_start_static_mean", "sequential_static_sum", "final_static_distance",
    "first_start_manhattan_mean", "sequential_manhattan_sum", "final_manhattan"
  )
  if (!all(required %in% names(data))) return(data)
  data$static_topology_missing <- as.numeric(
    !is.finite(data$first_start_static_mean) |
      !is.finite(data$sequential_static_sum) |
      !is.finite(data$final_static_distance)
  )
  data$first_start_static_fallback <- ifelse(
    is.finite(data$first_start_static_mean),
    data$first_start_static_mean,
    data$first_start_manhattan_mean
  )
  data$sequential_static_fallback <- ifelse(
    is.finite(data$sequential_static_sum),
    data$sequential_static_sum,
    data$sequential_manhattan_sum
  )
  data$final_static_fallback <- ifelse(
    is.finite(data$final_static_distance),
    data$final_static_distance,
    data$final_manhattan
  )
  data
}
rows <- add_checkpoint_fallback_features(rows)

prediction_metrics <- function(actual, predicted) {
  actual <- as.numeric(actual)
  predicted <- as.numeric(predicted)
  keep <- is.finite(actual) & is.finite(predicted)
  actual <- actual[keep]
  predicted <- predicted[keep]
  if (!length(actual)) return(list(sampleSize = 0, rmse = NA_real_, mae = NA_real_, rSquared = NA_real_))
  sse <- sum((actual - predicted)^2)
  sst <- sum((actual - mean(actual))^2)
  list(
    sampleSize = length(actual),
    rmse = sqrt(mean((actual - predicted)^2)),
    mae = mean(abs(actual - predicted)),
    rSquared = if (sst > 0) 1 - sse / sst else NA_real_
  )
}

binary_metrics <- function(actual, predicted) {
  actual <- as.integer(actual)
  predicted <- as.numeric(predicted)
  keep <- actual %in% c(0L, 1L) & is.finite(predicted)
  actual <- actual[keep]
  predicted <- predicted[keep]
  if (!length(actual)) return(list(sampleSize = 0, actualRate = NA_real_, predictedRate = NA_real_, brier = NA_real_))
  list(
    sampleSize = length(actual),
    actualRate = mean(actual),
    predictedRate = mean(predicted),
    brier = mean((actual - predicted)^2)
  )
}

model_coefficients <- function(model) {
  values <- stats::coef(model)
  values <- values[is.finite(values)]
  as.list(stats::setNames(as.numeric(values), names(values)))
}

model_xlevels <- function(model) {
  lapply(model$xlevels %||% list(), as.character)
}

heldout_lm <- function(formula, data, outcome, folds = 5L) {
  valid_blocks <- is.finite(data$block_index)
  data <- data[valid_blocks, , drop = FALSE]
  if (nrow(data) < 60 || length(unique(data$block_index)) < 3) return(list(status = "insufficient-data"))
  fold_id <- as.integer(data$block_index) %% folds
  actual_all <- numeric()
  predicted_all <- numeric()
  fold_rows <- list()
  for (fold in sort(unique(fold_id))) {
    train <- data[fold_id != fold, , drop = FALSE]
    test <- data[fold_id == fold, , drop = FALSE]
    if (nrow(train) < 40 || nrow(test) < 10) next
    model <- tryCatch(stats::lm(formula, data = train, na.action = na.omit), error = function(e) NULL)
    if (is.null(model)) next
    predicted <- tryCatch(as.numeric(stats::predict(model, newdata = test)), error = function(e) rep(NA_real_, nrow(test)))
    actual <- as.numeric(test[[outcome]])
    metrics <- prediction_metrics(actual, predicted)
    fold_rows[[length(fold_rows) + 1]] <- data.frame(fold = fold, n = metrics$sampleSize, rmse = metrics$rmse, mae = metrics$mae, rSquared = metrics$rSquared)
    keep <- is.finite(actual) & is.finite(predicted)
    actual_all <- c(actual_all, actual[keep])
    predicted_all <- c(predicted_all, predicted[keep])
  }
  if (!length(actual_all)) return(list(status = "no-valid-folds"))
  list(status = "ok", method = "block-grouped-5-fold", aggregate = prediction_metrics(actual_all, predicted_all), folds = do.call(rbind, fold_rows))
}

heldout_glm <- function(formula, data, outcome, folds = 5L) {
  valid_blocks <- is.finite(data$block_index)
  data <- data[valid_blocks, , drop = FALSE]
  if (nrow(data) < 80 || length(unique(data$block_index)) < 3) return(list(status = "insufficient-data"))
  fold_id <- as.integer(data$block_index) %% folds
  actual_all <- integer()
  predicted_all <- numeric()
  fold_rows <- list()
  for (fold in sort(unique(fold_id))) {
    train <- data[fold_id != fold, , drop = FALSE]
    test <- data[fold_id == fold, , drop = FALSE]
    if (nrow(train) < 50 || nrow(test) < 10) next
    response <- as.integer(train[[outcome]])
    if (length(unique(response[!is.na(response)])) < 2) next
    model <- tryCatch(suppressWarnings(stats::glm(formula, data = train, family = stats::binomial(), na.action = na.omit)), error = function(e) NULL)
    if (is.null(model)) next
    predicted <- tryCatch(as.numeric(stats::predict(model, newdata = test, type = "response")), error = function(e) rep(NA_real_, nrow(test)))
    actual <- as.integer(test[[outcome]])
    metrics <- binary_metrics(actual, predicted)
    fold_rows[[length(fold_rows) + 1]] <- data.frame(fold = fold, n = metrics$sampleSize, actualRate = metrics$actualRate, predictedRate = metrics$predictedRate, brier = metrics$brier)
    keep <- actual %in% c(0L, 1L) & is.finite(predicted)
    actual_all <- c(actual_all, actual[keep])
    predicted_all <- c(predicted_all, predicted[keep])
  }
  if (!length(actual_all)) return(list(status = "no-valid-folds"))
  list(status = "ok", method = "block-grouped-5-fold", aggregate = binary_metrics(actual_all, predicted_all), folds = do.call(rbind, fold_rows))
}

complete_formula_rows <- function(formula, data, outcome) {
  if (!nrow(data)) return(data)
  frame <- tryCatch(stats::model.frame(formula, data = data, na.action = stats::na.pass), error = function(e) NULL)
  if (is.null(frame)) return(data[FALSE, , drop = FALSE])
  keep <- stats::complete.cases(frame) & is.finite(data$block_index)
  if (outcome %in% names(data)) {
    if (is.logical(data[[outcome]])) {
      keep <- keep & !is.na(data[[outcome]])
    } else {
      keep <- keep & is.finite(as.numeric(data[[outcome]]))
    }
  }
  data[keep, , drop = FALSE]
}

residual_spread <- function(values) {
  values <- as.numeric(values)
  values <- values[is.finite(values)]
  if (!length(values)) return(list())
  list(
    absoluteP50 = q_safe(abs(values), 0.50),
    absoluteP80 = q_safe(abs(values), 0.80),
    absoluteP90 = q_safe(abs(values), 0.90),
    absoluteP95 = q_safe(abs(values), 0.95),
    signedP05 = q_safe(values, 0.05),
    signedP95 = q_safe(values, 0.95)
  )
}

heldout_lm_extended <- function(formula, data, outcome, folds = 5L) {
  data <- complete_formula_rows(formula, data, outcome)
  if (nrow(data) < 60 || length(unique(data$block_index)) < 3) return(list(status = "insufficient-data"))
  fold_id <- as.integer(data$block_index) %% folds
  actual_all <- numeric()
  predicted_all <- numeric()
  baseline_all <- numeric()
  fold_rows <- list()
  for (fold in sort(unique(fold_id))) {
    train <- data[fold_id != fold, , drop = FALSE]
    test <- data[fold_id == fold, , drop = FALSE]
    if (nrow(train) < 40 || nrow(test) < 10) next
    model <- tryCatch(stats::lm(formula, data = train, na.action = na.omit), error = function(e) NULL)
    if (is.null(model)) next
    predicted <- tryCatch(as.numeric(stats::predict(model, newdata = test)), error = function(e) rep(NA_real_, nrow(test)))
    actual <- as.numeric(test[[outcome]])
    baseline_value <- mean(as.numeric(train[[outcome]]), na.rm = TRUE)
    baseline <- rep(baseline_value, length(actual))
    keep <- is.finite(actual) & is.finite(predicted)
    if (!any(keep)) next
    metrics <- prediction_metrics(actual[keep], predicted[keep])
    baseline_metrics <- prediction_metrics(actual[keep], baseline[keep])
    fold_rows[[length(fold_rows) + 1]] <- data.frame(
      fold = fold,
      n = metrics$sampleSize,
      rmse = metrics$rmse,
      mae = metrics$mae,
      rSquared = metrics$rSquared,
      baselineRmse = baseline_metrics$rmse,
      baselineMae = baseline_metrics$mae
    )
    actual_all <- c(actual_all, actual[keep])
    predicted_all <- c(predicted_all, predicted[keep])
    baseline_all <- c(baseline_all, baseline[keep])
  }
  if (!length(actual_all)) return(list(status = "no-valid-folds"))
  residuals <- actual_all - predicted_all
  list(
    status = "ok",
    method = "block-grouped-5-fold",
    sampleSize = length(actual_all),
    aggregate = prediction_metrics(actual_all, predicted_all),
    baseline = prediction_metrics(actual_all, baseline_all),
    residualSpread = residual_spread(residuals),
    folds = do.call(rbind, fold_rows)
  )
}

binary_calibration_bins <- function(actual, predicted) {
  keep <- actual %in% c(0L, 1L) & is.finite(predicted)
  actual <- as.integer(actual[keep])
  predicted <- pmin(1, pmax(0, as.numeric(predicted[keep])))
  if (!length(actual)) return(list())
  breaks <- c(0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0000001)
  labels <- c("0-0.10", "0.10-0.25", "0.25-0.50", "0.50-0.75", "0.75-0.90", "0.90-1.00")
  bins <- cut(predicted, breaks = breaks, labels = labels, include.lowest = TRUE, right = FALSE)
  lapply(labels, function(label) {
    selected <- bins == label
    list(
      bin = label,
      n = sum(selected, na.rm = TRUE),
      predictedMean = if (any(selected, na.rm = TRUE)) mean(predicted[selected], na.rm = TRUE) else NA_real_,
      actualRate = if (any(selected, na.rm = TRUE)) mean(actual[selected], na.rm = TRUE) else NA_real_
    )
  })
}

heldout_glm_extended <- function(formula, data, outcome, folds = 5L) {
  data <- complete_formula_rows(formula, data, outcome)
  if (nrow(data) < 80 || length(unique(data$block_index)) < 3) return(list(status = "insufficient-data"))
  fold_id <- as.integer(data$block_index) %% folds
  actual_all <- integer()
  predicted_all <- numeric()
  baseline_all <- numeric()
  fold_rows <- list()
  for (fold in sort(unique(fold_id))) {
    train <- data[fold_id != fold, , drop = FALSE]
    test <- data[fold_id == fold, , drop = FALSE]
    if (nrow(train) < 50 || nrow(test) < 10) next
    response <- as.integer(train[[outcome]])
    if (length(unique(response)) < 2) next
    model <- tryCatch(suppressWarnings(stats::glm(formula, data = train, family = stats::binomial(), na.action = na.omit)), error = function(e) NULL)
    if (is.null(model)) next
    predicted <- tryCatch(as.numeric(stats::predict(model, newdata = test, type = "response")), error = function(e) rep(NA_real_, nrow(test)))
    actual <- as.integer(test[[outcome]])
    baseline_rate <- mean(as.integer(train[[outcome]]), na.rm = TRUE)
    baseline <- rep(baseline_rate, length(actual))
    keep <- actual %in% c(0L, 1L) & is.finite(predicted)
    if (!any(keep)) next
    metrics <- binary_metrics(actual[keep], predicted[keep])
    baseline_metrics <- binary_metrics(actual[keep], baseline[keep])
    fold_rows[[length(fold_rows) + 1]] <- data.frame(
      fold = fold,
      n = metrics$sampleSize,
      actualRate = metrics$actualRate,
      predictedRate = metrics$predictedRate,
      brier = metrics$brier,
      baselineBrier = baseline_metrics$brier
    )
    actual_all <- c(actual_all, actual[keep])
    predicted_all <- c(predicted_all, predicted[keep])
    baseline_all <- c(baseline_all, baseline[keep])
  }
  if (!length(actual_all)) return(list(status = "no-valid-folds"))
  list(
    status = "ok",
    method = "block-grouped-5-fold",
    sampleSize = length(actual_all),
    aggregate = binary_metrics(actual_all, predicted_all),
    baseline = binary_metrics(actual_all, baseline_all),
    calibrationBins = binary_calibration_bins(actual_all, predicted_all),
    predictedRange = list(
      p01 = q_safe(predicted_all, 0.01),
      p05 = q_safe(predicted_all, 0.05),
      p50 = q_safe(predicted_all, 0.50),
      p95 = q_safe(predicted_all, 0.95),
      p99 = q_safe(predicted_all, 0.99)
    ),
    folds = do.call(rbind, fold_rows)
  )
}

compare_lm_candidates <- function(data, outcome, formulas) {
  lapply(names(formulas), function(name) {
    formula <- formulas[[name]]
    result <- heldout_lm_extended(formula, data, outcome)
    list(
      name = name,
      formula = paste(deparse(formula), collapse = " "),
      heldOut = result
    )
  })
}

compare_glm_candidates <- function(data, outcome, formulas) {
  lapply(names(formulas), function(name) {
    formula <- formulas[[name]]
    result <- heldout_glm_extended(formula, data, outcome)
    list(
      name = name,
      formula = paste(deparse(formula), collapse = " "),
      heldOut = result
    )
  })
}

fit_lm_snapshot <- function(name, stage, formula, data, outcome, min_n = 50L) {
  model <- tryCatch(stats::lm(formula, data = data, na.action = na.omit), error = function(e) NULL)
  if (is.null(model) || stats::nobs(model) < min_n) {
    return(list(status = "insufficient-data", model = name, stage = stage, sampleSize = if (is.null(model)) 0 else stats::nobs(model)))
  }
  residuals <- stats::residuals(model)
  summary <- summary(model)
  list(
    status = "ok",
    model = name,
    stage = stage,
    outcome = outcome,
    formula = paste(deparse(formula), collapse = " "),
    sampleSize = stats::nobs(model),
    residualSigma = sqrt(mean(residuals^2)),
    residualSpread = list(
      absoluteP50 = q_safe(abs(residuals), 0.50),
      absoluteP80 = q_safe(abs(residuals), 0.80),
      absoluteP90 = q_safe(abs(residuals), 0.90),
      absoluteP95 = q_safe(abs(residuals), 0.95),
      signedP05 = q_safe(residuals, 0.05),
      signedP95 = q_safe(residuals, 0.95)
    ),
    diagnostics = list(rSquared = unname(summary$r.squared), adjustedRSquared = unname(summary$adj.r.squared), aic = unname(stats::AIC(model))),
    coefficients = model_coefficients(model),
    factorLevels = model_xlevels(model),
    heldOut = heldout_lm(formula, data, outcome)
  )
}

fit_glm_snapshot <- function(name, stage, formula, data, outcome, min_n = 80L) {
  response <- as.integer(data[[outcome]])
  if (nrow(data) < min_n || length(unique(response[!is.na(response)])) < 2) {
    return(list(status = "insufficient-data", model = name, stage = stage, sampleSize = nrow(data)))
  }
  model <- tryCatch(suppressWarnings(stats::glm(formula, data = data, family = stats::binomial(), na.action = na.omit)), error = function(e) NULL)
  if (is.null(model) || stats::nobs(model) < min_n) return(list(status = "insufficient-data", model = name, stage = stage, sampleSize = if (is.null(model)) 0 else stats::nobs(model)))
  list(
    status = "ok",
    model = name,
    stage = stage,
    outcome = outcome,
    formula = paste(deparse(formula), collapse = " "),
    sampleSize = stats::nobs(model),
    coefficients = model_coefficients(model),
    factorLevels = model_xlevels(model),
    heldOut = heldout_glm(formula, data, outcome)
  )
}

normal <- rows[rows$stratum == "normal", , drop = FALSE]
dynamic_archiving <- rows[rows$stratum == "dynamic-archiving", , drop = FALSE]

# Target-bearing terms are retained only as diagnostics so the new evidence can be
# compared with the historical model family. Production candidates use physical
# construction evidence only; requested difficulty/length remain external targets.
counts_terms_no_inventory <- "player_factor + board_factor + flag_factor + board_spread_factor + difficulty_factor + length_factor"
counts_terms <- paste(counts_terms_no_inventory, "+ inventory_factor")
counts_physical_no_inventory <- "player_factor + board_factor + flag_factor + board_spread_factor"
counts_physical <- paste(counts_physical_no_inventory, "+ inventory_factor")
profile_terms <- "profile_overall + profile_hazard + profile_congestion + profile_complexity + profile_swinginess + profile_density"
layout_terms <- "compactness + adjacency_count + graph_diameter"
board_terms <- paste(counts_terms, "+", profile_terms, "+", layout_terms)
board_physical_terms <- paste(counts_physical, "+", profile_terms, "+", layout_terms)
checkpoint_common_terms <- "board_depth_mean + represented_board_count + shallow_checkpoint_count"
checkpoint_manhattan_terms <- paste("first_start_manhattan_mean + sequential_manhattan_sum + final_manhattan +", checkpoint_common_terms)
checkpoint_static_terms <- paste("first_start_static_mean + sequential_static_sum + final_static_distance +", checkpoint_common_terms)
checkpoint_geometry_terms <- paste("first_start_manhattan_mean + first_start_static_mean + sequential_manhattan_sum + sequential_static_sum + final_manhattan + final_static_distance +", checkpoint_common_terms)
checkpoint_hybrid_terms <- paste(
  "first_start_manhattan_mean + first_start_static_fallback +",
  "sequential_manhattan_sum + sequential_static_fallback +",
  "final_manhattan + final_static_fallback + static_topology_missing +",
  checkpoint_common_terms
)
checkpoint_terms_static_only <- paste(board_terms, "+", checkpoint_static_terms)
checkpoint_terms <- paste(board_terms, "+", checkpoint_geometry_terms)
checkpoint_manhattan_physical_terms <- paste(board_physical_terms, "+", checkpoint_manhattan_terms)
checkpoint_hybrid_physical_terms <- paste(board_physical_terms, "+", checkpoint_hybrid_terms)

build_staged_models <- function(data, prefix) {
  outcomes <- data[data$scenario_available & is.finite(data$length_raw) & is.finite(data$difficulty_raw), , drop = FALSE]
  feasibility_data <- data[data$model_eligible, , drop = FALSE]
  cost_data <- data[data$model_eligible & is.finite(data$route_expansions), , drop = FALSE]
  cost_data$log_route_expansions <- log1p(cost_data$route_expansions)

  length_counts_formula <- stats::as.formula(paste("length_raw ~", counts_physical))
  difficulty_counts_formula <- stats::as.formula(paste("difficulty_raw ~", counts_physical))
  length_boards_formula <- stats::as.formula(paste("length_raw ~", board_physical_terms))
  difficulty_boards_formula <- stats::as.formula(paste("difficulty_raw ~", board_physical_terms))
  length_checkpoints_formula <- stats::as.formula(paste("length_raw ~", checkpoint_hybrid_physical_terms))
  difficulty_checkpoints_formula <- stats::as.formula(paste("difficulty_raw ~", checkpoint_hybrid_physical_terms))

  feasibility_counts_formula <- stats::as.formula(paste("structural_success ~", counts_physical))
  feasibility_boards_formula <- stats::as.formula(paste("structural_success ~", board_physical_terms))
  feasibility_checkpoints_formula <- stats::as.formula(paste("structural_success ~", checkpoint_hybrid_physical_terms))
  target_hit_formula <- stats::as.formula(paste("target_hit ~", counts_terms))

  # structural_success is intentionally excluded from route-cost predictors:
  # it is an analysis outcome unavailable at preflight and would leak future
  # information into a model used to guide construction work.
  cost_counts_formula <- stats::as.formula(paste("log_route_expansions ~", counts_physical))
  cost_boards_formula <- stats::as.formula(paste("log_route_expansions ~", board_physical_terms))
  cost_checkpoints_formula <- stats::as.formula(paste("log_route_expansions ~", checkpoint_hybrid_physical_terms))

  list(
    countsKnown = list(
      length = fit_lm_snapshot(paste0(prefix, "-length-counts"), "counts-known", length_counts_formula, outcomes, "length_raw"),
      difficulty = fit_lm_snapshot(paste0(prefix, "-difficulty-counts"), "counts-known", difficulty_counts_formula, outcomes, "difficulty_raw"),
      structuralSuccess = fit_glm_snapshot(paste0(prefix, "-structural-success-counts"), "counts-known", feasibility_counts_formula, feasibility_data, "structural_success"),
      currentBandHitDiagnostic = fit_glm_snapshot(paste0(prefix, "-current-band-hit-counts"), "counts-known-diagnostic", target_hit_formula, feasibility_data, "target_hit"),
      routeCost = fit_lm_snapshot(paste0(prefix, "-log-route-expansions-counts"), "counts-known", cost_counts_formula, cost_data, "log_route_expansions")
    ),
    boardsKnown = list(
      length = fit_lm_snapshot(paste0(prefix, "-length-boards"), "boards-known", length_boards_formula, outcomes, "length_raw"),
      difficulty = fit_lm_snapshot(paste0(prefix, "-difficulty-boards"), "boards-known", difficulty_boards_formula, outcomes, "difficulty_raw"),
      structuralSuccess = fit_glm_snapshot(paste0(prefix, "-structural-success-boards"), "boards-known", feasibility_boards_formula, feasibility_data, "structural_success"),
      routeCost = fit_lm_snapshot(paste0(prefix, "-log-route-expansions-boards"), "boards-known", cost_boards_formula, cost_data, "log_route_expansions")
    ),
    checkpointsKnown = list(
      length = fit_lm_snapshot(paste0(prefix, "-length-checkpoints"), "checkpoints-known", length_checkpoints_formula, outcomes, "length_raw"),
      difficulty = fit_lm_snapshot(paste0(prefix, "-difficulty-checkpoints"), "checkpoints-known", difficulty_checkpoints_formula, outcomes, "difficulty_raw"),
      structuralSuccess = fit_glm_snapshot(paste0(prefix, "-structural-success-checkpoints"), "checkpoints-known", feasibility_checkpoints_formula, feasibility_data, "structural_success"),
      routeCost = fit_lm_snapshot(paste0(prefix, "-log-route-expansions-checkpoints"), "checkpoints-known", cost_checkpoints_formula, cost_data, "log_route_expansions")
    )
  )
}

models <- list(
  normal = build_staged_models(normal, "normal"),
  dynamicArchiving = build_staged_models(dynamic_archiving, "dynamic-archiving")
)

normal_outcomes <- normal[normal$scenario_available & is.finite(normal$length_raw) & is.finite(normal$difficulty_raw), , drop = FALSE]
inventory_ablation_formula <- stats::as.formula(paste("length_raw ~", counts_terms_no_inventory))
inventory_full_formula <- stats::as.formula(paste("length_raw ~", counts_terms))
checkpoint_static_only_formula <- stats::as.formula(paste("length_raw ~", checkpoint_terms_static_only))
checkpoint_combined_formula <- stats::as.formula(paste("length_raw ~", checkpoint_terms))

counterfactual_rows <- list()
for (record in observations) {
  source <- record$evidence$outcome
  construction <- record$evidence$construction
  if (is.null(source) || is.null(construction)) next
  plan <- record$plan %||% list()
  profiles <- path_get(construction, "boardProfiles", "means") %||% list()
  shape <- construction$shape %||% list()
  layout <- construction$layout %||% list()

  for (counterfactual in record$counterfactuals %||% list()) {
    paired <- counterfactual$evidence$outcome
    if (is.null(paired)) next

    counterfactual_rows[[length(counterfactual_rows) + 1]] <- data.frame(
      run_id = safe_chr(record$runId),
      observation_index = safe_num(record$index),
      block_index = safe_num(record$blockIndex),
      stratum = safe_chr(record$stratum),
      kind = safe_chr(counterfactual$kind),
      treatment = safe_chr(counterfactual$treatment),
      player_count = safe_num(plan$playerCount),
      requested_difficulty = safe_chr(plan$difficulty),
      requested_length = safe_chr(plan$length),
      requested_board_spread = if (identical(safe_chr(plan$boardSpread), "tight")) "tight" else "random",
      requested_board_count = safe_num(plan$boardCount),
      requested_flag_count = safe_num(plan$flagCount),
      inventory_preset = safe_chr(plan$inventoryPreset),
      overlay_board_count = safe_num(construction$overlayBoardCount),
      overlay_piece_ids = structural_overlay_ids(construction),
      profile_overall = safe_num(profiles$overall),
      profile_hazard = safe_num(profiles$hazard),
      profile_congestion = safe_num(profiles$congestion),
      profile_complexity = safe_num(profiles$complexity),
      profile_swinginess = safe_num(profiles$swinginess),
      profile_density = safe_num(profiles$density),
      compactness = safe_num(layout$compactness),
      adjacency_count = safe_num(layout$adjacencyCount),
      graph_diameter = safe_num(layout$graphDiameter),
      first_start_manhattan_mean = safe_num(shape$firstStartManhattanMean),
      first_start_static_mean = safe_num(shape$firstStartStaticMean),
      sequential_manhattan_sum = safe_num(shape$sequentialManhattanSum),
      sequential_static_sum = safe_num(shape$sequentialStaticSum),
      final_manhattan = safe_num(shape$finalManhattan),
      final_static_distance = safe_num(shape$finalStaticDistance),
      board_depth_mean = safe_num(shape$boardDepthMean),
      represented_board_count = safe_num(shape$representedBoardCount),
      shallow_checkpoint_count = safe_num(shape$shallowCheckpointCount),
      source_difficulty = safe_num(source$difficultyRaw),
      paired_difficulty = safe_num(paired$difficultyRaw),
      source_length = safe_num(source$lengthRaw),
      paired_length = safe_num(paired$lengthRaw),
      source_expansions = safe_num(path_get(record, "work", "totalExpansions")),
      paired_expansions = safe_num(path_get(counterfactual, "work", "totalExpansions")),
      stringsAsFactors = FALSE
    )
  }
}
counterfactuals <- if (length(counterfactual_rows)) do.call(rbind, counterfactual_rows) else data.frame()

if (nrow(counterfactuals)) {
  counterfactuals$delta_difficulty <- counterfactuals$paired_difficulty - counterfactuals$source_difficulty
  counterfactuals$delta_length <- counterfactuals$paired_length - counterfactuals$source_length
  counterfactuals$delta_expansions <- counterfactuals$paired_expansions - counterfactuals$source_expansions

  counterfactuals$effect_difficulty <- counterfactuals$delta_difficulty
  counterfactuals$effect_length <- counterfactuals$delta_length
  counterfactuals$effect_expansions <- counterfactuals$delta_expansions
  counterfactuals$effect_direction <- "paired-minus-source"

  recovery_dynamic <- counterfactuals$kind == "recovery-rule" & counterfactuals$treatment == "dynamic_archiving"
  recovery_reboot <- counterfactuals$kind == "recovery-rule" & counterfactuals$treatment == "reboot_tokens"
  counterfactuals$effect_direction[recovery_dynamic | recovery_reboot] <- "dynamic-archiving-minus-reboot-tokens"
  counterfactuals$effect_difficulty[recovery_reboot] <- -counterfactuals$delta_difficulty[recovery_reboot]
  counterfactuals$effect_length[recovery_reboot] <- -counterfactuals$delta_length[recovery_reboot]
  counterfactuals$effect_expansions[recovery_reboot] <- -counterfactuals$delta_expansions[recovery_reboot]

  overlay_rows <- counterfactuals$kind == "remove-board-overlays"
  counterfactuals$effect_direction[overlay_rows] <- "structural-overlay-minus-base-topology"
  counterfactuals$effect_difficulty[overlay_rows] <- -counterfactuals$delta_difficulty[overlay_rows]
  counterfactuals$effect_length[overlay_rows] <- -counterfactuals$delta_length[overlay_rows]
  counterfactuals$effect_expansions[overlay_rows] <- -counterfactuals$delta_expansions[overlay_rows]

  raw_log_expansion_delta <- log1p(pmax(0, counterfactuals$paired_expansions)) -
    log1p(pmax(0, counterfactuals$source_expansions))
  counterfactuals$effect_log_expansions <- raw_log_expansion_delta
  counterfactuals$effect_log_expansions[recovery_reboot] <- -raw_log_expansion_delta[recovery_reboot]
  counterfactuals$effect_log_expansions[overlay_rows] <- -raw_log_expansion_delta[overlay_rows]

  counterfactuals <- factorize(counterfactuals)
  counterfactuals <- add_checkpoint_fallback_features(counterfactuals)
}

paired_summary_data <- function(data) {
  if (is.null(data) || !nrow(data)) return(list(sampleSize = 0))
  directions <- unique(data$effect_direction[!is.na(data$effect_direction)])
  expansion_ratio <- ifelse(
    is.finite(data$source_expansions) & is.finite(data$paired_expansions) & data$paired_expansions >= 0,
    (data$source_expansions + 1) / (data$paired_expansions + 1),
    NA_real_
  )
  list(
    sampleSize = nrow(data),
    effectDirection = if (length(directions) == 1) directions[[1]] else paste(sort(directions), collapse = "|"),
    difficultyEffectMean = mean_safe(data$effect_difficulty),
    difficultyEffectMedian = q_safe(data$effect_difficulty, 0.5),
    difficultyEffectP10 = q_safe(data$effect_difficulty, 0.1),
    difficultyEffectP90 = q_safe(data$effect_difficulty, 0.9),
    lengthEffectMean = mean_safe(data$effect_length),
    lengthEffectMedian = q_safe(data$effect_length, 0.5),
    lengthEffectP10 = q_safe(data$effect_length, 0.1),
    lengthEffectP90 = q_safe(data$effect_length, 0.9),
    expansionEffectMean = mean_safe(data$effect_expansions),
    expansionEffectMedian = q_safe(data$effect_expansions, 0.5),
    sourceToPairedExpansionRatioMedian = q_safe(expansion_ratio, 0.5),
    sourceToPairedExpansionRatioP90 = q_safe(expansion_ratio, 0.9)
  )
}

paired_summary <- function(kind) {
  if (!nrow(counterfactuals)) return(list(sampleSize = 0))
  paired_summary_data(counterfactuals[counterfactuals$kind == kind, , drop = FALSE])
}

paired_summary_by_treatment <- function(kind) {
  if (!nrow(counterfactuals)) return(list())
  data <- counterfactuals[counterfactuals$kind == kind, , drop = FALSE]
  if (!nrow(data)) return(list())
  treatments <- sort(unique(data$treatment[!is.na(data$treatment)]))
  lapply(treatments, function(treatment) {
    selected <- data[data$treatment == treatment, , drop = FALSE]
    summary <- paired_summary_data(selected)
    summary$treatment <- treatment
    summary
  })
}

overlay_count_summaries <- list()
overlay_piece_summaries <- list()
if (nrow(counterfactuals)) {
  overlay_effects_for_summary <- counterfactuals[counterfactuals$kind == "remove-board-overlays", , drop = FALSE]
  if (nrow(overlay_effects_for_summary)) {
    overlay_counts_for_summary <- sort(unique(
      overlay_effects_for_summary$overlay_board_count[is.finite(overlay_effects_for_summary$overlay_board_count)]
    ))
    overlay_count_summaries <- lapply(overlay_counts_for_summary, function(count) {
      data <- overlay_effects_for_summary[
        overlay_effects_for_summary$overlay_board_count == count,
        ,
        drop = FALSE
      ]
      summary <- paired_summary_data(data)
      summary$overlayBoardCount <- count
      summary
    })

    encoded_ids <- overlay_effects_for_summary$overlay_piece_ids
    all_piece_ids <- sort(unique(unlist(lapply(encoded_ids[!is.na(encoded_ids)], function(value) {
      strsplit(value, "|", fixed = TRUE)[[1]]
    }))))
    all_piece_ids <- all_piece_ids[nzchar(all_piece_ids)]
    overlay_piece_summaries <- lapply(all_piece_ids, function(piece_id) {
      keep <- vapply(encoded_ids, overlay_id_present, logical(1), piece_id = piece_id)
      data <- overlay_effects_for_summary[keep, , drop = FALSE]
      summary <- paired_summary_data(data)
      summary$pieceId <- piece_id
      summary$singleOverlayOnlySampleSize <- sum(data$overlay_board_count == 1, na.rm = TRUE)
      summary$interpretation <- if (summary$singleOverlayOnlySampleSize >= 12) {
        "piece-specific evidence includes a useful single-overlay subset"
      } else {
        "diagnostic-only; piece effect may be confounded by co-occurring overlays"
      }
      summary
    })
  }
}

treatment_models <- list()
if (nrow(counterfactuals)) {
  recovery_effects <- counterfactuals[counterfactuals$kind == "recovery-rule", , drop = FALSE]
  overlay_effects <- counterfactuals[counterfactuals$kind == "remove-board-overlays", , drop = FALSE]
  dynamic_archiving_length_terms <- checkpoint_manhattan_physical_terms
  treatment_terms <- checkpoint_hybrid_physical_terms

  treatment_models$dynamicArchiving <- list(
    length = fit_lm_snapshot(
      "dynamic-archiving-paired-length-effect",
      "paired-treatment",
      stats::as.formula(paste("effect_length ~", dynamic_archiving_length_terms)),
      recovery_effects,
      "effect_length",
      min_n = 80L
    ),
    difficulty = fit_lm_snapshot(
      "dynamic-archiving-paired-difficulty-effect",
      "paired-treatment",
      stats::as.formula(paste("effect_difficulty ~", treatment_terms)),
      recovery_effects,
      "effect_difficulty",
      min_n = 80L
    )
  )

  overlay_effect_terms <- paste("overlay_board_count +", checkpoint_terms)
  treatment_models$structuralBoardOverlay <- list(
    length = fit_lm_snapshot(
      "structural-board-overlay-paired-length-effect",
      "paired-treatment",
      stats::as.formula(paste("effect_length ~", overlay_effect_terms)),
      overlay_effects,
      "effect_length",
      min_n = 80L
    ),
    difficulty = fit_lm_snapshot(
      "structural-board-overlay-paired-difficulty-effect",
      "paired-treatment",
      stats::as.formula(paste("effect_difficulty ~", overlay_effect_terms)),
      overlay_effects,
      "effect_difficulty",
      min_n = 80L
    ),
    routeCostLogRatio = fit_lm_snapshot(
      "structural-board-overlay-paired-route-cost-log-ratio",
      "paired-treatment",
      stats::as.formula(paste(
        "effect_log_expansions ~ overlay_board_count +",
        checkpoint_manhattan_physical_terms
      )),
      overlay_effects,
      "effect_log_expansions",
      min_n = 80L
    )
  )
}
models$treatments <- treatment_models


# Production model-selection follow-up. These candidate sets are intentionally
# group-based rather than stepwise: the goal is to learn which evidence families
# generalize, not to mine a large coefficient table for chance significance.
normal_feasibility <- normal[normal$model_eligible, , drop = FALSE]
normal_cost <- normal[normal$model_eligible & is.finite(normal$route_expansions), , drop = FALSE]
normal_cost$log_route_expansions <- log1p(normal_cost$route_expansions)

stage_candidate_terms <- list(
  # Historical target-bearing candidates, retained for comparison only.
  countsNoInventory = counts_terms_no_inventory,
  countsWithInventory = counts_terms,
  boardsProfilesOnly = paste(counts_terms, "+", profile_terms),
  boardsLayoutOnly = paste(counts_terms, "+", layout_terms),
  boardsFull = board_terms,
  checkpointsManhattan = paste(board_terms, "+", checkpoint_manhattan_terms),
  checkpointsStatic = paste(board_terms, "+", checkpoint_static_terms),
  checkpointsGeometryOnly = paste(counts_terms, "+", checkpoint_geometry_terms),
  checkpointsFull = checkpoint_terms,
  # v47 production candidates: intrinsic physical evidence only.
  countsPhysicalNoInventory = counts_physical_no_inventory,
  countsPhysical = counts_physical,
  boardsPhysical = board_physical_terms,
  checkpointsManhattanPhysical = checkpoint_manhattan_physical_terms,
  checkpointsHybridPhysical = checkpoint_hybrid_physical_terms
)

make_formulas <- function(outcome, names) {
  stats::setNames(
    lapply(names, function(name) stats::as.formula(paste(outcome, "~", stage_candidate_terms[[name]]))),
    names
  )
}

normal_model_selection <- list(
  length = compare_lm_candidates(
    normal_outcomes,
    "length_raw",
    make_formulas("length_raw", c(
      "countsNoInventory", "countsWithInventory", "countsPhysicalNoInventory", "countsPhysical",
      "boardsProfilesOnly", "boardsLayoutOnly", "boardsFull", "boardsPhysical",
      "checkpointsManhattan", "checkpointsStatic", "checkpointsGeometryOnly", "checkpointsFull",
      "checkpointsManhattanPhysical", "checkpointsHybridPhysical"
    ))
  ),
  difficulty = compare_lm_candidates(
    normal_outcomes,
    "difficulty_raw",
    make_formulas("difficulty_raw", c(
      "countsNoInventory", "countsWithInventory", "countsPhysicalNoInventory", "countsPhysical",
      "boardsProfilesOnly", "boardsLayoutOnly", "boardsFull", "boardsPhysical",
      "checkpointsManhattan", "checkpointsStatic", "checkpointsGeometryOnly", "checkpointsFull",
      "checkpointsManhattanPhysical", "checkpointsHybridPhysical"
    ))
  ),
  structuralSuccess = compare_glm_candidates(
    normal_feasibility,
    "structural_success",
    make_formulas("structural_success", c(
      "countsNoInventory", "countsWithInventory", "countsPhysicalNoInventory", "countsPhysical",
      "boardsProfilesOnly", "boardsLayoutOnly", "boardsFull", "boardsPhysical",
      "checkpointsManhattan", "checkpointsStatic", "checkpointsGeometryOnly", "checkpointsFull",
      "checkpointsManhattanPhysical", "checkpointsHybridPhysical"
    ))
  ),
  routeCost = compare_lm_candidates(
    normal_cost,
    "log_route_expansions",
    make_formulas("log_route_expansions", c(
      "countsNoInventory", "countsWithInventory", "countsPhysicalNoInventory", "countsPhysical",
      "boardsProfilesOnly", "boardsLayoutOnly", "boardsFull", "boardsPhysical",
      "checkpointsManhattan", "checkpointsStatic", "checkpointsGeometryOnly", "checkpointsFull",
      "checkpointsManhattanPhysical", "checkpointsHybridPhysical"
    ))
  )
)

treatment_model_selection <- list()
if (nrow(counterfactuals)) {
  recovery_effects <- counterfactuals[counterfactuals$kind == "recovery-rule", , drop = FALSE]
  overlay_effects <- counterfactuals[counterfactuals$kind == "remove-board-overlays", , drop = FALSE]

  recovery_candidate_terms <- list(
    constant = "1",
    counts = counts_physical,
    geometryReduced = checkpoint_manhattan_physical_terms,
    full = checkpoint_hybrid_physical_terms
  )
  overlay_candidate_terms <- list(
    constant = "1",
    overlayCount = "overlay_board_count",
    overlayCountCounts = paste("overlay_board_count +", counts_physical),
    overlayCountGeometry = paste("overlay_board_count +", checkpoint_manhattan_physical_terms),
    full = paste("overlay_board_count +", checkpoint_hybrid_physical_terms)
  )

  treatment_formula_set <- function(outcome, terms) {
    stats::setNames(
      lapply(names(terms), function(name) stats::as.formula(paste(outcome, "~", terms[[name]]))),
      names(terms)
    )
  }

  treatment_model_selection$dynamicArchiving <- list(
    length = compare_lm_candidates(
      recovery_effects, "effect_length",
      treatment_formula_set("effect_length", recovery_candidate_terms)
    ),
    difficulty = compare_lm_candidates(
      recovery_effects, "effect_difficulty",
      treatment_formula_set("effect_difficulty", recovery_candidate_terms)
    ),
    routeCostLogRatio = compare_lm_candidates(
      recovery_effects, "effect_log_expansions",
      treatment_formula_set("effect_log_expansions", recovery_candidate_terms)
    )
  )

  treatment_model_selection$structuralBoardOverlay <- list(
    length = compare_lm_candidates(
      overlay_effects, "effect_length",
      treatment_formula_set("effect_length", overlay_candidate_terms)
    ),
    difficulty = compare_lm_candidates(
      overlay_effects, "effect_difficulty",
      treatment_formula_set("effect_difficulty", overlay_candidate_terms)
    ),
    routeCostLogRatio = compare_lm_candidates(
      overlay_effects, "effect_log_expansions",
      treatment_formula_set("effect_log_expansions", overlay_candidate_terms)
    )
  )

  single_overlay <- overlay_effects[
    overlay_effects$overlay_board_count == 1 &
      !is.na(overlay_effects$overlay_piece_ids) &
      nzchar(overlay_effects$overlay_piece_ids),
    ,
    drop = FALSE
  ]
  if (nrow(single_overlay)) {
    single_overlay$overlay_piece_factor <- factor(single_overlay$overlay_piece_ids)
    piece_terms <- list(
      constant = "1",
      pieceOnly = "overlay_piece_factor",
      pieceCounts = paste("overlay_piece_factor +", counts_physical)
    )
    treatment_model_selection$structuralBoardOverlay$singleOverlayPieceIdentity <- list(
      sampleSize = nrow(single_overlay),
      pieceLevels = levels(single_overlay$overlay_piece_factor),
      length = compare_lm_candidates(
        single_overlay, "effect_length",
        treatment_formula_set("effect_length", piece_terms)
      ),
      difficulty = compare_lm_candidates(
        single_overlay, "effect_difficulty",
        treatment_formula_set("effect_difficulty", piece_terms)
      ),
      routeCostLogRatio = compare_lm_candidates(
        single_overlay, "effect_log_expansions",
        treatment_formula_set("effect_log_expansions", piece_terms)
      )
    )
  }
}

model_selection <- list(
  role = list(
    predictorPolicy = "requested targets are comparison policy, not raw-outcome predictors; prefer full-coverage physical models with matched held-out support",
    structuralSuccessPolicy = "soft-prioritization-only-unless-out-of-fold-extremes-prove-reliably-calibrated",
    routeCostPolicy = "no-analysis-outcome-predictors; model-log1p-expansions-from-evidence-known-before-exact-routing",
    treatmentPolicy = "contextual-treatment-model-must-beat-constant-held-out-baseline-before-production-use",
    pieceIdentityPolicy = "single-overlay-held-out-test-only; two-overlay-piece-effects-remain-confounded"
  ),
  normal = normal_model_selection,
  treatments = treatment_model_selection
)

route_work_raw_tail_diagnostics <- function(formula, data, folds = 5L) {
  data <- complete_formula_rows(formula, data, "log_route_expansions")
  if (nrow(data) < 60 || length(unique(data$block_index)) < 3) return(list(status = "insufficient-data"))
  fold_id <- as.integer(data$block_index) %% folds
  actual_log <- numeric()
  predicted_log <- numeric()
  static_missing <- numeric()
  for (fold in sort(unique(fold_id))) {
    train <- data[fold_id != fold, , drop = FALSE]
    test <- data[fold_id == fold, , drop = FALSE]
    if (nrow(train) < 40 || nrow(test) < 10) next
    model <- tryCatch(stats::lm(formula, data = train, na.action = na.omit), error = function(e) NULL)
    if (is.null(model)) next
    predicted <- tryCatch(as.numeric(stats::predict(model, newdata = test)), error = function(e) rep(NA_real_, nrow(test)))
    actual <- as.numeric(test$log_route_expansions)
    keep <- is.finite(actual) & is.finite(predicted)
    if (!any(keep)) next
    actual_log <- c(actual_log, actual[keep])
    predicted_log <- c(predicted_log, predicted[keep])
    if ("static_topology_missing" %in% names(test)) {
      static_missing <- c(static_missing, as.numeric(test$static_topology_missing[keep]))
    }
  }
  if (!length(actual_log)) return(list(status = "no-valid-folds"))
  actual_exp <- pmax(0, expm1(actual_log))
  predicted_exp <- pmax(0, expm1(predicted_log))
  raw_residual <- actual_exp - predicted_exp
  log_residual <- actual_log - predicted_log
  ratio <- (actual_exp + 1) / (predicted_exp + 1)
  summarize_group <- function(selected) {
    if (!any(selected)) return(list(sampleSize = 0))
    list(
      sampleSize = sum(selected),
      actualExpansionsMedian = q_safe(actual_exp[selected], 0.50),
      actualExpansionsP90 = q_safe(actual_exp[selected], 0.90),
      underpredictionRatioP90 = q_safe(ratio[selected], 0.90),
      underpredictionRatioP95 = q_safe(ratio[selected], 0.95),
      underpredictionRatioP99 = q_safe(ratio[selected], 0.99),
      logResidualSignedP95 = q_safe(log_residual[selected], 0.95),
      logResidualSignedP99 = q_safe(log_residual[selected], 0.99)
    )
  }
  result <- list(
    status = "ok",
    method = "block-grouped-5-fold; transformed back from log1p for tail diagnostics",
    sampleSize = length(actual_exp),
    rawRmse = sqrt(mean(raw_residual ^ 2)),
    rawMae = mean(abs(raw_residual)),
    actualExpansionsMedian = q_safe(actual_exp, 0.50),
    actualExpansionsP90 = q_safe(actual_exp, 0.90),
    actualExpansionsP95 = q_safe(actual_exp, 0.95),
    underpredictionRatioP90 = q_safe(ratio, 0.90),
    underpredictionRatioP95 = q_safe(ratio, 0.95),
    underpredictionRatioP99 = q_safe(ratio, 0.99),
    underpredictionRatioMax = max(ratio, na.rm = TRUE),
    rawResidualSignedP90 = q_safe(raw_residual, 0.90),
    rawResidualSignedP95 = q_safe(raw_residual, 0.95),
    rawResidualSignedP99 = q_safe(raw_residual, 0.99),
    logResidualSignedP95 = q_safe(log_residual, 0.95),
    logResidualSignedP99 = q_safe(log_residual, 0.99)
  )
  if (length(static_missing) == length(actual_exp)) {
    result$byStaticTopology <- list(
      available = summarize_group(static_missing == 0),
      missing = summarize_group(static_missing == 1)
    )
  }
  result
}

stratum_names <- sort(unique(rows$stratum))
stratum_summary <- lapply(stratum_names, function(name) {
  data <- rows[rows$stratum == name, , drop = FALSE]
  eligible <- data$model_eligible
  list(
    stratum = name,
    observations = nrow(data),
    modelEligibleObservations = sum(eligible),
    scenarioRateAll = mean(data$scenario_available),
    scenarioRateEligible = if (sum(eligible)) mean(data$scenario_available[eligible]) else NA_real_,
    structuralSuccessRateEligible = if (sum(eligible)) mean(data$structural_success[eligible]) else NA_real_,
    currentBandHitRateEligible = if (sum(eligible)) mean(data$target_hit[eligible]) else NA_real_,
    wallSecondsMedian = q_safe(data$wall_elapsed_ms / 1000, 0.5),
    wallSecondsP90 = q_safe(data$wall_elapsed_ms / 1000, 0.9),
    expansionsMedian = q_safe(data$route_expansions, 0.5),
    expansionsP90 = q_safe(data$route_expansions, 0.9)
  )
})

variant_names <- sort(unique(rows$variant_id[rows$variant_id != "none"]))
variant_summary <- lapply(variant_names, function(name) {
  data <- rows[rows$variant_id == name, , drop = FALSE]
  eligible <- data$model_eligible
  list(
    variantId = name,
    observations = nrow(data),
    modelEligibleObservations = sum(eligible),
    scenarioRateEligible = if (sum(eligible)) mean(data$scenario_available[eligible]) else NA_real_,
    structuralSuccessRateEligible = if (sum(eligible)) mean(data$structural_success[eligible]) else NA_real_,
    currentBandHitRateEligible = if (sum(eligible)) mean(data$target_hit[eligible]) else NA_real_
  )
})

distance_diagnostics <- list(
  opening = list(
    manhattanVsActualActions = cor_safe(normal_outcomes$first_start_manhattan_mean, normal_outcomes$opening_fastest_actions),
    staticVsActualActions = cor_safe(normal_outcomes$first_start_static_mean, normal_outcomes$opening_fastest_actions)
  ),
  final = list(
    manhattanVsActualActions = cor_safe(normal_outcomes$final_manhattan, normal_outcomes$final_fastest_actions),
    staticVsActualActions = cor_safe(normal_outcomes$final_static_distance, normal_outcomes$final_fastest_actions)
  ),
  courseLength = list(
    sequentialManhattanVsLengthRaw = cor_safe(normal_outcomes$sequential_manhattan_sum, normal_outcomes$length_raw),
    sequentialStaticVsLengthRaw = cor_safe(normal_outcomes$sequential_static_sum, normal_outcomes$length_raw)
  ),
  heldOutCheckpointLength = list(
    staticOnly = heldout_lm(checkpoint_static_only_formula, normal_outcomes, "length_raw"),
    manhattanPlusStatic = heldout_lm(checkpoint_combined_formula, normal_outcomes, "length_raw")
  ),
  productionRole = "retain-both-manhattan-and-static-distance-families"
)

inventory_diagnostics <- list(
  heldOutCountsLength = list(
    withoutInventory = heldout_lm(inventory_ablation_formula, normal_outcomes, "length_raw"),
    withInventory = heldout_lm(inventory_full_formula, normal_outcomes, "length_raw")
  ),
  productionRole = "selected-inventory-is-counts-known-evidence"
)

convergence_diagnostics <- list(
  convergenceMeanVsTrafficPenalty = cor_safe(normal_outcomes$convergence_mean, normal_outcomes$traffic_average_penalty),
  convergenceMeanVsDifficultyRaw = cor_safe(normal_outcomes$convergence_mean, normal_outcomes$difficulty_raw),
  convergenceMaxVsTrafficPenalty = cor_safe(normal_outcomes$convergence_max, normal_outcomes$traffic_average_penalty),
  productionRole = "diagnostic-only; local-open-approach convergence is excluded from fitted production predictors"
)

selected_route_cost_formula <- stats::as.formula(paste("log_route_expansions ~", checkpoint_hybrid_physical_terms))
route_work_tail_diagnostics <- route_work_raw_tail_diagnostics(selected_route_cost_formula, normal_cost)

static_missing_normal <- normal_outcomes[is.finite(normal_outcomes$static_topology_missing), , drop = FALSE]
static_topology_diagnostics <- list(
  missingCount = sum(static_missing_normal$static_topology_missing == 1),
  availableCount = sum(static_missing_normal$static_topology_missing == 0),
  missingShare = mean(static_missing_normal$static_topology_missing == 1),
  routeExpansionsMedianMissing = q_safe(static_missing_normal$route_expansions[static_missing_normal$static_topology_missing == 1], 0.50),
  routeExpansionsP90Missing = q_safe(static_missing_normal$route_expansions[static_missing_normal$static_topology_missing == 1], 0.90),
  routeExpansionsMedianAvailable = q_safe(static_missing_normal$route_expansions[static_missing_normal$static_topology_missing == 0], 0.50),
  routeExpansionsP90Available = q_safe(static_missing_normal$route_expansions[static_missing_normal$static_topology_missing == 0], 0.90),
  productionRole = "missing static topology is retained as explicit uncertainty/work evidence; never treat it as route impossibility"
)

status_counts <- as.list(table(rows$status, useNA = "ifany"))
overlay_scenarios <- rows[rows$scenario_available & is.finite(rows$overlay_board_count), , drop = FALSE]
overlay_counts <- as.list(table(overlay_scenarios$overlay_board_count, useNA = "ifany"))

coverage <- list(
  observations = nrow(rows),
  modelEligibleObservations = sum(rows$model_eligible),
  scenarios = sum(rows$scenario_available),
  structuralSuccesses = sum(rows$structural_success),
  currentBandHits = sum(rows$target_hit),
  statusCounts = status_counts,
  players = sort(unique(rows$player_count[is.finite(rows$player_count)])),
  requestedBoardCounts = sort(unique(rows$requested_board_count[is.finite(rows$requested_board_count)])),
  requestedFlagCounts = sort(unique(rows$requested_flag_count[is.finite(rows$requested_flag_count)])),
  difficulties = sort(unique(rows$requested_difficulty[!is.na(rows$requested_difficulty)])),
  lengths = sort(unique(rows$requested_length[!is.na(rows$requested_length)])),
  boardSpreads = sort(unique(rows$requested_board_spread[!is.na(rows$requested_board_spread)])),
  boardSpreadCounts = as.list(table(rows$requested_board_spread, useNA = "ifany")),
  checkpointSamplingRegimes = sort(unique(rows$checkpoint_sampling_regime[!is.na(rows$checkpoint_sampling_regime)])),
  checkpointSamplingRegimeCounts = as.list(table(rows$checkpoint_sampling_regime, useNA = "ifany")),
  inventoryPresets = sort(unique(rows$inventory_preset[!is.na(rows$inventory_preset)])),
  structuralOverlayScenarioCounts = overlay_counts,
  checkpointStaticTopologyMissing = sum(rows$scenario_available & rows$static_topology_missing == 1, na.rm = TRUE)
)

timing <- list(
  wallSecondsMedian = q_safe(rows$wall_elapsed_ms / 1000, 0.5),
  wallSecondsP90 = q_safe(rows$wall_elapsed_ms / 1000, 0.9),
  wallSecondsP95 = q_safe(rows$wall_elapsed_ms / 1000, 0.95),
  wallSecondsP99 = q_safe(rows$wall_elapsed_ms / 1000, 0.99),
  wallSecondsMax = max(rows$wall_elapsed_ms / 1000, na.rm = TRUE),
  routeExpansionsMedian = q_safe(rows$route_expansions, 0.5),
  routeExpansionsP90 = q_safe(rows$route_expansions, 0.9),
  routeExpansionsP95 = q_safe(rows$route_expansions, 0.95),
  routeExpansionsP99 = q_safe(rows$route_expansions, 0.99),
  routeExpansionsMax = max(rows$route_expansions, na.rm = TRUE),
  cappedSearchesMedian = q_safe(rows$capped_searches, 0.5),
  timeoutCount = sum(rows$status == "timeout", na.rm = TRUE),
  unexpectedErrorCount = sum(rows$status == "error", na.rm = TRUE)
)

run_sources <- lapply(headers, function(run_header) list(
  runId = run_header$runId %||% NA_character_,
  seed = run_header$seed %||% NA_integer_,
  harness = run_header$harness %||% NA_character_,
  study = path_get(run_header, "config", "study") %||% "general",
  referenceAnalysisMode = path_get(run_header, "config", "analysisMode") %||% NA_character_,
  node = path_get(run_header, "environment", "node") %||% NA_character_
))

result <- list(
  schemaVersion = 3,
  analysis = "construction-guidance-v3-model-selection",
  generatedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
  source = list(
    inputFiles = input_files,
    runs = run_sources
  ),
  role = list(
    primary = "predict-continuous-raw-length-difficulty-structural-success-and-analysis-cost-from-cheap-construction-evidence",
    bandPolicy = "bands-remain-external-player-facing-targets; current-band hit models are diagnostic only",
    uncertainty = "in-sample residual spreads are retained in model snapshots; modelSelection adds out-of-fold residual spreads",
    excludedStatuses = "setup-invalid, timeout, and harness error are operational/setup evidence and are excluded from structural-success fitting",
    convergencePolicy = "local open-approach convergence remains diagnostic and is not a fitted production predictor",
    targetPredictorPolicy = "requested difficulty/length are external comparison targets and are excluded from v47 production raw-outcome predictors",
    staticTopologyPolicy = "missing static distance falls back to Manhattan with an explicit missingness indicator; missing static topology is not route impossibility",
    safety = "calibration-is-optional-generation-guidance-not-route-legality"
  ),
  coverage = coverage,
  timing = timing,
  summaries = list(
    byStratum = stratum_summary,
    structuralVariants = variant_summary,
    pairedRecovery = paired_summary("recovery-rule"),
    pairedOverlayRemoval = paired_summary("remove-board-overlays"),
    pairedOverlayRemovalByCount = overlay_count_summaries,
    pairedOverlayRemovalByPiece = overlay_piece_summaries,
    pairedGenerationMode = paired_summary("generation-mode-effort"),
    pairedGenerationModeByTreatment = paired_summary_by_treatment("generation-mode-effort"),
    pairedGenerationModeInterpretation = paste(
      "difficulty/length deltas compare the same accepted physical course against the Balanced-source outcome;",
      "elapsed/work totals are not a like-for-like runtime comparison because the source observation includes construction/preflight work",
      "while the paired reanalysis starts from fixed placements"
    )
  ),
  diagnostics = list(
    distanceValue = distance_diagnostics,
    inventoryValue = inventory_diagnostics,
    convergenceValue = convergence_diagnostics,
    staticTopology = static_topology_diagnostics,
    routeWorkTail = route_work_tail_diagnostics
  ),
  models = models,
  modelSelection = model_selection
)

dir.create(dirname(output_file), recursive = TRUE, showWarnings = FALSE)
jsonlite::write_json(result, output_file, pretty = TRUE, auto_unbox = TRUE, null = "null", na = "null", digits = 10)

cat("Calibration analysis complete\n")
cat("Inputs:", paste(input_files, collapse = ", "), "\n")
cat("Observations:", coverage$observations, "\n")
cat("Scenarios:", coverage$scenarios, "\n")
cat("Structural successes:", coverage$structuralSuccesses, "\n")
cat("Current-band hits:", coverage$currentBandHits, "\n")
overlay_pair_summary <- paired_summary("remove-board-overlays")
recovery_pair_summary <- paired_summary("recovery-rule")
cat("Paired overlay removals:", overlay_pair_summary$sampleSize, "\n")
if (length(overlay_count_summaries)) {
  cat("Overlay pairs by count:", paste(vapply(overlay_count_summaries, function(item) {
    paste0(item$overlayBoardCount, "=", item$sampleSize)
  }, character(1)), collapse = ", "), "\n")
}
cat("Paired recovery-rule comparisons:", recovery_pair_summary$sampleSize, "\n")
cat("Wall time median/p90:", round(timing$wallSecondsMedian, 2), "/", round(timing$wallSecondsP90, 2), "seconds\n")
cat("Output:", output_file, "\n")
