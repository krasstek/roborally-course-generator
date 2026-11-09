# Preflight gate fit (ROADMAP D5). Reads scripts/preflight-study.mjs output and
# asks: from what is known right after the quick course preflight, how well can
# the attempt's final difficulty, length and acceptance be predicted, and how
# much attempt time could an early stop save for how many lost good courses?
#
#   Rscript tools/preflight-fit.R calibration-output/preflight-study/run-20261109.jsonl \
#     [calibration/preflight-gate.json]
#
# Uses base R and jsonlite only. All quality numbers are 5-fold out-of-fold, so
# they estimate performance on attempts the fit has not seen.
suppressPackageStartupMessages(library(jsonlite))

args <- commandArgs(trailingOnly = TRUE)
input <- if (length(args) >= 1) args[[1]] else "calibration-output/preflight-study/run-20261109.jsonl"
output <- if (length(args) >= 2) args[[2]] else NA_character_

# App band limits (src/generation/targets.js).
difficulty_bands <- list(easy = c(0, 3.6), moderate = c(3.6, 4.4), hard = c(4.4, 5.4), brutal = c(5.4, Inf))
length_bands <- list(short = c(0, 6.25), moderate = c(6.25, 9.5), long = c(9.5, 13), epic = c(13, 20))

lines <- readLines(input, warn = FALSE)
rows <- lapply(lines[nzchar(lines)], fromJSON, simplifyVector = FALSE)
g <- function(x, ...) { for (k in c(...)) { if (is.null(x)) return(NA); x <- x[[k]] }; if (is.null(x)) NA else x }
d <- data.frame(
  players = sapply(rows, g, "request", "playerCount"),
  difficulty_target = sapply(rows, g, "request", "difficulty"),
  length_target = sapply(rows, g, "request", "length"),
  mode = sapply(rows, g, "request", "generationMode"),
  sets = sapply(rows, function(r) length(r$request$sets)),
  reached = sapply(rows, function(r) isTRUE(r$preflight$reached)),
  pf_difficulty = as.numeric(sapply(rows, g, "preflight", "difficultyRaw")),
  pf_length = as.numeric(sapply(rows, g, "preflight", "lengthRaw")),
  pf_routed = as.numeric(sapply(rows, g, "preflight", "openingRouted")),
  pf_required = as.numeric(sapply(rows, g, "preflight", "openingRequired")),
  pf_sources = as.numeric(sapply(rows, g, "preflight", "sourceStarts")),
  pf_expansions = as.numeric(sapply(rows, g, "preflight", "routeExpansions")),
  pf_capped = as.numeric(sapply(rows, g, "preflight", "cappedSearches")),
  boards = as.numeric(sapply(rows, g, "preflight", "boards")),
  checkpoints = as.numeric(sapply(rows, g, "preflight", "checkpoints")),
  variants = sapply(rows, function(r) length(r$preflight$variants)),
  gd_difficulty = as.numeric(sapply(rows, g, "guidance", "difficultyLog")),
  gd_length = as.numeric(sapply(rows, g, "guidance", "lengthLog")),
  gd_expansions = as.numeric(sapply(rows, g, "guidance", "predictedExpansions")),
  built = sapply(rows, function(r) isTRUE(r$outcome$built)),
  evaluated = sapply(rows, function(r) isTRUE(r$outcome$evaluated)),
  acceptable = sapply(rows, function(r) isTRUE(r$outcome$acceptable)),
  final_difficulty = as.numeric(sapply(rows, g, "outcome", "difficultyTurnRE")),
  final_length = as.numeric(sapply(rows, g, "outcome", "lengthWallClockTurnIndex")),
  total_ms = as.numeric(sapply(rows, g, "timing", "totalMs")),
  pre_ms = as.numeric(sapply(rows, g, "timing", "toPreflightEndMs")),
  stringsAsFactors = FALSE
)

cat(sprintf("attempts %d; preflight reached %d; built %d; evaluated %d; acceptable %d\n",
  nrow(d), sum(d$reached), sum(d$built), sum(d$evaluated), sum(d$acceptable)))
cat(sprintf("time: total %.0f s; before preflight end %.0f s (%.0f%%)\n",
  sum(d$total_ms, na.rm = TRUE) / 1000, sum(d$pre_ms, na.rm = TRUE) / 1000,
  100 * sum(d$pre_ms, na.rm = TRUE) / sum(d$total_ms, na.rm = TRUE)))

# Attempts that have preflight numbers: the gate can only act on these.
p <- subset(d, reached & is.finite(pf_difficulty) & is.finite(pf_length) & pf_difficulty > 0 & pf_length > 0 & is.finite(pre_ms))
p$routed_share <- with(p, pf_routed / pmax(1, pf_sources))
p$routed_slack <- with(p, pf_routed - pf_required)
p$log_pf_d <- log(p$pf_difficulty); p$log_pf_l <- log(p$pf_length)
p$log_exp <- log1p(p$pf_expansions)
p$gd_d <- ifelse(is.finite(p$gd_difficulty), p$gd_difficulty, mean(p$gd_difficulty, na.rm = TRUE))
p$gd_l <- ifelse(is.finite(p$gd_length), p$gd_length, mean(p$gd_length, na.rm = TRUE))
p$fast <- as.numeric(p$mode == "fast")
p$saved_ms <- pmax(0, p$total_ms - p$pre_ms)
cat(sprintf("gate-eligible attempts %d (acceptable %d); time after preflight in them %.0f s\n",
  nrow(p), sum(p$acceptable), sum(p$saved_ms) / 1000))

set.seed(20261109)
folds <- sample(rep(1:5, length.out = nrow(p)))
oof <- function(formula, data, family = NULL, subset_rows = rep(TRUE, nrow(data))) {
  pred <- rep(NA_real_, nrow(data))
  for (k in 1:5) {
    train <- data[folds != k & subset_rows, ]
    fit <- if (is.null(family)) lm(formula, data = train) else glm(formula, data = train, family = family)
    test <- folds == k
    pred[test] <- predict(fit, newdata = data[test, ], type = "response")
  }
  pred
}
r2 <- function(y, yhat) { ok <- is.finite(y) & is.finite(yhat); 1 - sum((y[ok] - yhat[ok])^2) / sum((y[ok] - mean(y[ok]))^2) }

# 1. Final difficulty and length (evaluated attempts only), log scale.
ev <- p$evaluated & is.finite(p$final_difficulty) & is.finite(p$final_length) & p$final_difficulty > 0 & p$final_length > 0
p$y_d <- ifelse(ev, log(p$final_difficulty), NA); p$y_l <- ifelse(ev, log(p$final_length), NA)
f_d_guidance <- y_d ~ gd_d
f_l_guidance <- y_l ~ gd_l
f_d <- y_d ~ gd_d + log_pf_d + log_pf_l + players + boards + checkpoints + routed_share + log_exp + variants + fast
f_l <- y_l ~ gd_l + log_pf_l + log_pf_d + players + boards + checkpoints + routed_share + log_exp + variants + fast
pd_g <- oof(f_d_guidance, p, subset_rows = ev); pl_g <- oof(f_l_guidance, p, subset_rows = ev)
pd <- oof(f_d, p, subset_rows = ev); pl <- oof(f_l, p, subset_rows = ev)
cat(sprintf("\nfinal difficulty (log), out-of-fold R2: guidance only %.2f -> with preflight %.2f\n", r2(p$y_d[ev], pd_g[ev]), r2(p$y_d[ev], pd[ev])))
cat(sprintf("final length (log),     out-of-fold R2: guidance only %.2f -> with preflight %.2f\n", r2(p$y_l[ev], pl_g[ev]), r2(p$y_l[ev], pl[ev])))

# 2. Probability the attempt ends acceptable. Band position features: how far
# the predicted final value sits from the requested band, in log units.
band_gap <- function(pred_log, targets, bands) {
  mapply(function(v, t) {
    b <- bands[[t]]; if (is.null(b)) return(NA)
    lo <- if (b[1] > 0) log(b[1]) else -Inf; hi <- if (is.finite(b[2])) log(b[2]) else Inf
    if (v < lo) lo - v else if (v > hi) v - hi else 0
  }, pred_log, targets)
}
# Out-of-fold predictions for every gate-eligible attempt (not only evaluated).
pd_all <- oof(f_d, p, subset_rows = ev); pl_all <- oof(f_l, p, subset_rows = ev)
p$gap_d <- band_gap(pd_all, p$difficulty_target, difficulty_bands)
p$gap_l <- band_gap(pl_all, p$length_target, length_bands)
f_acc <- acceptable ~ gap_d + gap_l + routed_share + routed_slack + log_exp + players + checkpoints + fast
p$p_acc <- oof(f_acc, p, family = binomial())
auc <- function(y, s) { r <- rank(s); n1 <- sum(y); n0 <- sum(!y); (sum(r[y]) - n1 * (n1 + 1) / 2) / (n1 * n0) }
cat(sprintf("\nP(acceptable) out-of-fold AUC %.2f (0.5 = no information, 1 = perfect)\n", auc(p$acceptable, p$p_acc)))

# 3. Gate trade-off: stop right after the preflight when P(acceptable) < t.
cat("\nthreshold  stopped  good courses lost  time saved (of all attempt time)\n")
total_time <- sum(d$total_ms, na.rm = TRUE)
thresholds <- c(0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2)
table_rows <- lapply(thresholds, function(t) {
  stop <- p$p_acc < t
  c(t = t, stopped = sum(stop), lost = sum(stop & p$acceptable), lost_share = sum(stop & p$acceptable) / max(1, sum(p$acceptable)),
    saved = sum(p$saved_ms[stop]) / total_time)
})
for (r in table_rows) cat(sprintf("%9.2f  %7d  %3d of %d (%4.1f%%)  %5.1f%%\n", r["t"], r["stopped"], r["lost"], sum(p$acceptable), 100 * r["lost_share"], 100 * r["saved"]))

if (!is.na(output)) {
  fit_acc <- glm(f_acc, data = p, family = binomial())
  fit_d <- lm(f_d, data = p[ev, ]); fit_l <- lm(f_l, data = p[ev, ])
  gate <- list(
    schema = 1,
    source = basename(input),
    attempts = nrow(d),
    difficulty = as.list(coef(fit_d)),
    length = as.list(coef(fit_l)),
    acceptable = as.list(coef(fit_acc)),
    defaults = list(gd_d = mean(p$gd_difficulty, na.rm = TRUE), gd_l = mean(p$gd_length, na.rm = TRUE)),
    quality = list(
      difficultyR2 = r2(p$y_d[ev], pd[ev]), lengthR2 = r2(p$y_l[ev], pl[ev]),
      acceptableAuc = auc(p$acceptable, p$p_acc)
    ),
    tradeoff = table_rows
  )
  writeLines(toJSON(gate, auto_unbox = TRUE, digits = 8, pretty = TRUE), output)
  cat(sprintf("\nwrote %s\n", output))
}
