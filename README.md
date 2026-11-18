# Training

Mobile training log for Evan, a hybrid athlete (running and strength). It is a static site he can add to an iPhone home screen from Safari. The app reads the CSVs in `data/` when it opens, so updating the log is just a commit.

After GitHub Pages is publishing this repo, the site is [https://ehawksley.github.io/training-dashboard/](https://ehawksley.github.io/training-dashboard/).

## Update the data

Edit these files and commit them to `main`. Append new rows under the same headers. The app loads the files from the network on each visit, so a new commit shows up with no code change.

- `data/runs.csv`
- `data/strength.csv`

Extra columns are ignored. More Garmin fields can be added later without breaking the page.

### Runs

`Date, Title, Run Type, Distance (mi), Moving Time, Avg Pace, Avg GAP, Avg HR, Max HR, Ascent (ft), Speed (m/min), Efficiency Factor, Include in trend, Notes`

- Run Type is `Base`, `Long`, `Threshold`, or `Sprint`.
- `Include in trend` is `Y` or `N`. Efficiency factor, pace, and heart-rate charts use `Y` only. Weekly mileage counts every run.
- Efficiency factor is speed in meters per minute divided by average heart rate.
- Notes are optional. Wrap a note in quotes if it contains a comma.
- Base runs are judged against 147 bpm.

### Strength

`Date, Day, Workout, Exercise, Set #, Reps, Weight (lb), Volume, Est 1RM (Epley), Notes`

- Bodyweight sets use `0` for weight. The app tracks those by reps (pull-ups) instead of an estimated 1RM.
- Carries are logged as `1` rep.
- Numbers may include thousands separators, quoted, like `"1,350"`.
- Estimated 1RM is Epley, `weight × (1 + reps / 30)`, taken from each session's best set. The column in the CSV is not required for the chart.
- Weeks start on Monday.

## Install on iPhone

1. Open the site in Safari.
2. Tap Share, then Add to Home Screen.
3. Open it from the icon. It runs standalone, caches the app shell, and always tries the network first for the CSVs.

Running, Strength, and Calendar are separate tabs. Running opens first.

## Run it locally

Relative links only work over HTTP, not from a `file://` URL.

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/ . The same files also work when the site is hosted under `/training-dashboard/`.

## Deploy

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) publishes the repository to GitHub Pages on every push to `main`.

In the repo settings, Pages → Build and deployment → Source must be **GitHub Actions**.
