library(tidyverse)
library(vroom)
library(jsonlite)

# ---- Load calibration data -----------------------------------------------

files <- list.files(
  path = ".",
  recursive = TRUE,
  pattern = "calibration-courses\\.csv$",
  full.names = TRUE
)

courses <- vroom(files, show_col_types = FALSE)

normal <- courses |>
  filter(
    normal_status == "ok",
    !is.na(normal_length_raw),
    !is.na(actual_board_count),
    !is.na(actual_flag_count)
  )

# ---- Fit simple additive length model ------------------------------------

m_len <- lm(
  normal_length_raw ~
    factor(actual_flag_count) +
    factor(actual_board_count),
  data = normal
)

m_len_interaction <- lm(
  normal_length_raw ~
    factor(actual_flag_count) *
    factor(actual_board_count),
  data = normal
)

# ---- Diagnostics ----------------------------------------------------------

rmse <- sqrt(mean(residuals(m_len)^2))
r2 <- summary(m_len)$r.squared
adj_r2 <- summary(m_len)$adj.r.squared

aic_additive <- AIC(m_len)
aic_interaction <- AIC(m_len_interaction)

# ---- Extract coefficients -------------------------------------------------

coefs <- coef(m_len)

flag_effects <- c(
  "2" = 0,
  "3" = unname(coefs["factor(actual_flag_count)3"]),
  "4" = unname(coefs["factor(actual_flag_count)4"]),
  "5" = unname(coefs["factor(actual_flag_count)5"]),
  "6" = unname(coefs["factor(actual_flag_count)6"])
)

board_effects <- c(
  "1" = 0,
  "2" = unname(coefs["factor(actual_board_count)2"]),
  "3" = unname(coefs["factor(actual_board_count)3"]),
  "4" = unname(coefs["factor(actual_board_count)4"])
)

# ---- Build app calibration object -----------------------------------------

calibration <- list(
  schemaVersion = 1,
  model = "additive-board-count-flag-count",
  outcome = "normal_length_raw",
  
  sampleSize = nrow(normal),
  
  diagnostics = list(
    rmse = unname(rmse),
    rSquared = unname(r2),
    adjustedRSquared = unname(adj_r2),
    additiveAIC = unname(aic_additive),
    interactionAIC = unname(aic_interaction)
  ),
  
  prediction = list(
    base = unname(coefs["(Intercept)"]),
    flagCount = as.list(flag_effects),
    boardCount = as.list(board_effects)
  )
)

cells <- normal |>
  count(actual_board_count, actual_flag_count)

print(cells)

# ---- Write JSON ------------------------------------------------------------

write_json(
  calibration,
  "calibration/length-calibration.json",
  pretty = TRUE,
  auto_unbox = TRUE,
  digits = 6
)

cat("Wrote calibration/length-calibration.json\n")
cat("N:", nrow(normal), "\n")
cat("RMSE:", round(rmse, 2), "\n")
cat("R2:", round(r2, 3), "\n")

