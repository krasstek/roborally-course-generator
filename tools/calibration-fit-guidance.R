# Robo Rally construction guidance, v3 fit
#
# Reads guidance-study calibration runs (tools/calibration-runner.js, default
# study) and fits what construction guidance predicts at each construction
# stage, in the units production accepts on:
#   difficulty = completed RE per programming turn (difficultyTurnRE), log scale
#   length     = wall-clock turn index (lengthWallClockTurnIndex), log scale
#   work       = route expansions (log scale)
#   success    = the built course survived to a finished scenario
#
# Difficulty and length are fitted on a log scale: variant and board effects are
# roughly proportional (Factory Rejects adds far more on an already hard course).
#
# Variant effects come from two places:
#   - rule variants: switched on and off on the same built course (paired
#     reloads), so their effect is measured directly, as a log ratio, and enters
#     the models as a fixed offset;
#   - layout variants (docks, staggering, Virtual Bots, Moving Targets): fitted
#     between courses as model terms.
#
# Run interactively (edit input_dirs below) or from the shell:
#   Rscript tools/calibration-fit-guidance.R <run dir or .jsonl> [...]
# Writes calibration/construction-guidance.json (replacing the old v2 file) and prints a short report.
#
# R dependency: jsonlite only.

input_dirs <- c(
  "calibration-output/full-2026-10-14"
)
output_file <- "calibration/construction-guidance.json"
folds <- 5

args <- commandArgs(trailingOnly = TRUE)
if (length(args)) input_dirs <- args

suppressPackageStartupMessages(library(jsonlite))
`%||%` <- function(left, right) if (is.null(left) || length(left) == 0) right else left
num <- function(value) {
  if (is.null(value) || length(value) == 0) return(NA_real_)
  result <- suppressWarnings(as.numeric(value[[1]]))
  if (!length(result) || !is.finite(result)) NA_real_ else result
}

difficulty_bands <- c(easy = 0, moderate = 4.0, hard = 4.8, brutal = 5.8)
length_bands <- c(short = 0, moderate = 6.25, long = 9.5, epic = 13)
band_of <- function(value, cuts) names(cuts)[pmax(1, findInterval(value, cuts))]

# ---- Read ---------------------------------------------------------------------
input_files <- unlist(lapply(input_dirs, function(path) {
  if (dir.exists(path)) list.files(path, pattern = "\\.jsonl$", full.names = TRUE) else path
}))
if (!length(input_files)) stop("No calibration JSONL files found.")

headers <- list()
observations <- list()
for (file in input_files) {
  for (line in readLines(file, warn = FALSE)) {
    if (!nzchar(line)) next
    record <- fromJSON(line, simplifyVector = FALSE)
    if (identical(record$recordType, "run")) headers[[length(headers) + 1]] <- record
    if (identical(record$recordType, "observation")) observations[[length(observations) + 1]] <- record
  }
}
design <- headers[[1]]$config$guidanceDesign
if (is.null(design)) stop("These runs are not guidance-study runs (no guidanceDesign in the header).")
variant_ids <- unlist(design$variantIds)
# Competitive cannot be switched on a built course (it needs enough starts for
# n blocks plus n picks); runs before 2026-10-15 toggled it anyway, so its
# toggles are ignored and it is fitted between courses like a layout variant.
toggle_ids <- setdiff(unlist(design$toggleVariantIds), "competitiveMode")
layout_variant_ids <- setdiff(variant_ids, toggle_ids)
cat(sprintf("Read %d observations from %d file(s).\n", length(observations), length(input_files)))

# ---- One row per observation ---------------------------------------------------
flatten <- function(record) {
  plan <- record$plan
  evidence <- record$evidence
  construction <- evidence$construction
  outcome <- evidence$outcome
  means <- construction$boardProfiles$means
  layout <- construction$layout
  shape <- construction$shape
  static_or_manhattan <- function(static, manhattan) if (is.finite(num(static))) num(static) else num(manhattan)
  active <- unlist(evidence$variants %||% plan$forcedVariantIds %||% list())
  row <- list(
    seed = num(record$seed),
    status = record$generation$status %||% NA_character_,
    players = num(plan$playerCount),
    boards = num(construction$boardCount %||% plan$boardCount),
    flags = num(construction$flagCount %||% plan$flagCount),
    spread = plan$boardSpread %||% NA_character_,
    inventory = plan$inventoryPreset %||% NA_character_,
    overlay_mode = plan$overlayMode %||% NA_character_,
    overlay_boards = num(construction$overlayBoardCount),
    overlay_tiles = num(construction$overlayTileCount),
    profile_overall = num(means$overall),
    profile_hazard = num(means$hazard),
    profile_congestion = num(means$congestion),
    profile_complexity = num(means$complexity),
    profile_swinginess = num(means$swinginess),
    profile_density = num(means$density),
    compactness = num(layout$compactness),
    adjacency = num(layout$adjacencyCount),
    diameter = num(layout$graphDiameter),
    first_distance = static_or_manhattan(shape$firstStartStaticMean, shape$firstStartManhattanMean),
    sequential_distance = static_or_manhattan(shape$sequentialStaticSum, shape$sequentialManhattanSum),
    final_distance = static_or_manhattan(shape$finalStaticDistance, shape$finalManhattan),
    convergence = num(shape$convergenceMean),
    board_depth = num(shape$boardDepthMean),
    represented_boards = num(shape$representedBoardCount),
    shallow_checkpoints = num(shape$shallowCheckpointCount),
    difficulty = num(outcome$difficultyTurnRE),
    length = num(outcome$lengthWallClockTurnIndex),
    work = num(record$work$totalExpansions),
    elapsed_s = num(record$generation$elapsedMs) / 1000
  )
  for (id in variant_ids) row[[paste0("v_", id)]] <- as.numeric(id %in% active)
  row
}
rows <- lapply(observations, flatten)
data <- as.data.frame(do.call(rbind, lapply(rows, function(row) as.data.frame(row, stringsAsFactors = FALSE))))
data$success <- as.numeric(data$status == "scenario")
data$players_f <- factor(data$players)
data$boards_f <- factor(data$boards)
data$flags_f <- factor(data$flags)
data$spread_f <- factor(data$spread)
data$inventory_f <- factor(data$inventory)

# ---- Paired variant effects ----------------------------------------------------
toggles <- do.call(rbind, lapply(observations, function(record) {
  pairs <- Filter(function(item) identical(item$kind, "variant-toggle") && !is.null(item$variantId), record$counterfactuals %||% list())
  if (!length(pairs)) return(NULL)
  do.call(rbind, lapply(pairs, function(pair) {
    sign <- if (isTRUE(pair$on)) 1 else -1
    data.frame(
      variant = pair$variantId,
      on = isTRUE(pair$on),
      failed = !is.null(pair$treatedFailure) || is.null(pair$treated),
      difficulty_effect = sign * (num(pair$treated$outcome$difficultyTurnRE) - num(pair$baseline$outcome$difficultyTurnRE)),
      length_effect = sign * (num(pair$treated$outcome$lengthWallClockTurnIndex) - num(pair$baseline$outcome$lengthWallClockTurnIndex)),
      difficulty_log = sign * (log(num(pair$treated$outcome$difficultyTurnRE)) - log(num(pair$baseline$outcome$difficultyTurnRE))),
      length_log = sign * (log(num(pair$treated$outcome$lengthWallClockTurnIndex)) - log(num(pair$baseline$outcome$lengthWallClockTurnIndex))),
      stringsAsFactors = FALSE
    )
  }))
}))
summarize_effect <- function(values) {
  values <- values[is.finite(values)]
  list(
    n = length(values),
    mean = if (length(values)) mean(values) else 0,
    median = if (length(values)) median(values) else 0,
    sd = if (length(values) > 1) sd(values) else NA_real_,
    p10 = if (length(values)) unname(quantile(values, 0.1)) else NA_real_,
    p90 = if (length(values)) unname(quantile(values, 0.9)) else NA_real_
  )
}
variant_effects <- lapply(setNames(toggle_ids, toggle_ids), function(id) {
  subset <- toggles[toggles$variant == id, , drop = FALSE]
  switched_on <- subset[subset$on, , drop = FALSE]
  list(
    difficulty = summarize_effect(subset$difficulty_effect[!subset$failed]),
    length = summarize_effect(subset$length_effect[!subset$failed]),
    difficultyLog = summarize_effect(subset$difficulty_log[!subset$failed]),
    lengthLog = summarize_effect(subset$length_log[!subset$failed]),
    toggles = nrow(subset),
    failureRateWhenSwitchedOn = if (nrow(switched_on)) mean(switched_on$failed) else NA_real_
  )
})

# Offsets: the paired mean log effects of the rule variants active on each course.
offset_for <- function(frame, target) {
  total <- numeric(nrow(frame))
  for (id in toggle_ids) {
    effect <- variant_effects[[id]][[paste0(target, "Log")]]
    if (effect$n >= 5) total <- total + frame[[paste0("v_", id)]] * effect$mean
  }
  total
}

# ---- Stage models ----------------------------------------------------------------
layout_terms <- paste0("v_", layout_variant_ids)
base_terms <- c("players_f", "boards_f", "flags_f", "spread_f", "inventory_f", layout_terms)
board_terms <- c(base_terms, "profile_overall", "profile_hazard", "profile_congestion", "profile_complexity",
  "profile_swinginess", "profile_density", "compactness", "adjacency", "diameter")
checkpoint_terms <- c(board_terms, "overlay_boards", "overlay_tiles", "first_distance", "sequential_distance",
  "final_distance", "convergence", "board_depth", "represented_boards", "shallow_checkpoints")
stages <- list(countsKnown = base_terms, boardsKnown = board_terms, checkpointsKnown = checkpoint_terms)

usable_terms <- function(frame, terms) {
  Filter(function(term) {
    column <- frame[[term]]
    if (is.factor(column)) nlevels(droplevels(column)) > 1 else length(unique(column[is.finite(column)])) > 1
  }, terms)
}

fit_stage_model <- function(frame, terms, target, transform = "identity", family = NULL) {
  frame <- frame[is.finite(frame[[target]]), , drop = FALSE]
  terms <- usable_terms(frame, terms)
  frame <- frame[stats::complete.cases(frame[, terms, drop = FALSE]), , drop = FALSE]
  response <- switch(transform, log1p = log1p(frame[[target]]), log = log(frame[[target]]), frame[[target]])
  offset <- if (target %in% c("difficulty", "length")) offset_for(frame, target) else numeric(nrow(frame))
  frame$.y <- response - offset
  formula <- stats::as.formula(paste(".y ~", paste(terms, collapse = " + ")))
  fit_one <- function(train) {
    if (is.null(family)) stats::lm(formula, data = train) else stats::glm(formula, data = train, family = family)
  }
  # Held-out evaluation, folds by observation.
  set.seed(20261014)
  fold <- sample(rep(seq_len(folds), length.out = nrow(frame)))
  predicted <- rep(NA_real_, nrow(frame))
  for (k in seq_len(folds)) {
    model <- fit_one(frame[fold != k, , drop = FALSE])
    test <- frame[fold == k, , drop = FALSE]
    for (term in terms) if (is.factor(test[[term]])) test[[term]] <- factor(test[[term]], levels = levels(model$model[[term]] %||% test[[term]]))
    predicted[fold == k] <- suppressWarnings(stats::predict(model, newdata = test, type = "response"))
  }
  model <- fit_one(frame)
  observed <- frame$.y
  residual <- observed - predicted
  ok <- is.finite(residual)
  evidence <- list(
    n = nrow(frame),
    heldOutRmse = sqrt(mean(residual[ok]^2)),
    heldOutRSquared = 1 - sum(residual[ok]^2) / sum((observed[ok] - mean(observed[ok]))^2),
    signedP05 = unname(quantile(residual[ok], 0.05)),
    signedP95 = unname(quantile(residual[ok], 0.95))
  )
  if (target %in% c("difficulty", "length")) {
    cuts <- if (target == "difficulty") difficulty_bands else length_bands
    evidence$heldOutBandHitRate <- mean(band_of(exp(predicted[ok] + offset[ok]), cuts) == band_of(frame[[target]][ok], cuts))
  }
  list(model = model, terms = terms, transform = transform, evidence = evidence)
}

export_model <- function(fitted, type = "linear") {
  model <- fitted$model
  coefficients <- stats::coef(model)
  coefficients[!is.finite(coefficients)] <- 0
  factors <- list()
  numeric_terms <- list()
  for (term in fitted$terms) {
    column <- model$model[[term]]
    if (is.factor(column)) {
      levels <- levels(column)
      values <- vapply(levels, function(level) {
        name <- paste0(term, level)
        if (name %in% names(coefficients)) unname(coefficients[[name]]) else 0
      }, numeric(1))
      factors[[sub("_f$", "", term)]] <- list(levels = levels, coefficients = unname(values))
    } else {
      numeric_terms[[term]] <- unname(coefficients[[term]] %||% 0)
    }
  }
  list(
    type = type,
    targetTransform = fitted$transform,
    intercept = unname(coefficients[["(Intercept)"]]),
    factors = factors,
    numeric = numeric_terms,
    evidence = fitted$evidence
  )
}

finished <- data[data$status == "scenario", , drop = FALSE]
attempted <- data[data$status %in% c("scenario", "analyzed-rejection", "construction-rejection", "timeout"), , drop = FALSE]
report <- list()
stage_export <- list()
for (stage in names(stages)) {
  terms <- stages[[stage]]
  difficulty_fit <- fit_stage_model(finished, terms, "difficulty", transform = "log")
  length_fit <- fit_stage_model(finished, terms, "length", transform = "log")
  work_fit <- fit_stage_model(finished, terms, "work", transform = "log1p")
  stage_export[[stage]] <- list(
    difficulty = export_model(difficulty_fit),
    length = export_model(length_fit),
    routeCost = export_model(work_fit)
  )
  if (stage == "countsKnown") {
    success_fit <- fit_stage_model(attempted, terms, "success", family = stats::binomial())
    stage_export[[stage]]$structuralSuccess <- export_model(success_fit, type = "logistic")
  }
  report[[stage]] <- sprintf("%-16s difficulty R2 %.2f RMSE %.2f band hit %.0f%% | length R2 %.2f RMSE %.2f band hit %.0f%% | work R2 %.2f",
    stage,
    difficulty_fit$evidence$heldOutRSquared, difficulty_fit$evidence$heldOutRmse, 100 * difficulty_fit$evidence$heldOutBandHitRate,
    length_fit$evidence$heldOutRSquared, length_fit$evidence$heldOutRmse, 100 * length_fit$evidence$heldOutBandHitRate,
    work_fit$evidence$heldOutRSquared)
}

# ---- Report ----------------------------------------------------------------------
cat(sprintf("Finished courses %d of %d observations; %d variant toggles.\n", nrow(finished), nrow(data), nrow(toggles %||% data.frame())))
for (line in report) cat(line, "\n")
effect_table <- do.call(rbind, lapply(toggle_ids, function(id) {
  effect <- variant_effects[[id]]
  data.frame(variant = id, n = effect$difficulty$n,
    difficulty = round(effect$difficulty$mean, 2), difficulty_pct = round(100 * (exp(effect$difficultyLog$mean) - 1)),
    difficulty_sd = round(effect$difficulty$sd, 2),
    length = round(effect$length$mean, 2), length_pct = round(100 * (exp(effect$lengthLog$mean) - 1)),
    fails_on = round(effect$failureRateWhenSwitchedOn, 2))
}))
cat("\nRule variants, paired mean effect when switched on (difficulty in RE per turn, length in wall-clock turns, and as %):\n")
print(effect_table[order(-effect_table$difficulty), ], row.names = FALSE)

# ---- Export ----------------------------------------------------------------------
output <- list(
  schemaVersion = 3,
  calibration = "robo-rally-construction-guidance-v3",
  source = list(
    generatedAt = format(Sys.time(), tz = "UTC", usetz = TRUE),
    runs = unique(vapply(headers, function(header) header$runId %||% "", character(1))),
    observations = nrow(data),
    finishedCourses = nrow(finished),
    variantToggles = nrow(toggles %||% data.frame())
  ),
  targets = list(difficulty = "difficultyTurnRE", length = "lengthWallClockTurnIndex"),
  domain = list(
    players = sort(unique(data$players)),
    boardCounts = sort(unique(data$boards[is.finite(data$boards)])),
    flagCounts = sort(unique(data$flags[is.finite(data$flags)])),
    boardSpreads = sort(unique(data$spread)),
    inventoryPresets = sort(unique(data$inventory))
  ),
  layoutVariants = layout_variant_ids,
  ruleVariantEffects = variant_effects,
  stages = stage_export
)
dir.create(dirname(output_file), showWarnings = FALSE, recursive = TRUE)
writeLines(toJSON(output, auto_unbox = TRUE, digits = 6, pretty = TRUE, null = "null", na = "null"), output_file)
cat(sprintf("\nWrote %s\n", output_file))
