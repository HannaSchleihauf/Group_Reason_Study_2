# Study 2

The web version of Study 2 is built on the Study 1 web version: the same stage,
confidence scale and practice, team choice, sticker task, video and check
screens, solution screen and data storage. The procedure follows
`procedure/STUDY 2 - Procedure.docx`. The texts follow the English and Dutch
scripts in `procedure/`.

| File | What it holds |
|---|---|
| `procedure/` | procedure and scripts (English, Dutch) |
| `video_stimuli/` | original recordings (2 GB; not used by the page, not in git) |
| `docs/` | the published copy of `Study2_Web` (GitHub Pages), made by `tools/make_site_folder.sh` |
| `Study2_Web/index.html` | the page (any web host); `claude_page.html` is the same page for claude.ai |
| `Study2_Web/config.js` | settings and all texts (English / Dutch) |
| `Study2_Web/app.js` | the task |
| `Study2_Web/data.js` | data storage on the device + Google Sheets (`SHEETS_URL`) |
| `Study2_Web/google_sheets/Code.gs` | Apps Script for the Study 2 Google Sheet |
| `Study2_Web/media/videos/`, `media/posters/` | web videos (960×540) and first frames, made by `tools/prepare_videos.swift` |
| `Study2_Web/tools/` | `run_local.sh` (test), `make_site_folder.sh` (GitHub Pages), `make_hostinger_zip.sh`, `prepare_videos.swift` |

All commands below are run from the `Study2_Web` folder.

## Session flow

1. **Start form**: language, participant number (counted up automatically),
   condition (*balanced* = automatic, or set to group / no-group by hand), age
   and gender.
2. **Introduction**: in the *group* condition the child picks a team and taps
   their team. In the *no-group* condition the child is the zoo helper and is
   shown both teams.
3. **Liking check**: one gender-matched member of each team (really like … really
   not like), then the **sticker task** (5 stickers).
4. **4 trials**, one animal pair each:
   - setup (in the first trial, the game introduction and scale practice);
   - **step 2**: belief video of each team (no reason), each followed by "what
     does the team think?" (replayed up to twice if wrong); the experimenter puts the
     toy animals on the logos;
   - **step 3**: initial belief (which animal, then how sure);
   - **step 4**: reason video of each team in the same order (good reason = 4
     boxes, weak = 2 boxes), each followed by "what do they think / how many
     boxes did they open?" (replayed up to twice if wrong);
   - **step 5**: final belief (the marker starts at the initial belief).
5. **Solution screen** (as in Study 1): the child taps each row of boxes; the
   child's final animal is always in most of them.
6. **End screen**: the child picks a sticker; the data can be downloaded as CSV.

The **(i)** button (top left) shows what to say on each screen. On a video
screen, the **s** key skips to the end of the video (for testing).

## Design and counterbalancing

Conditions: group = IG (the child's team gives the good reason) / OG; no-group =
T1 (Team A gives the good reason) / T2. Trial order A-first = IG IG OG OG (T1 T1 T2 T2),
B-first = the reverse.

Each session gets a counterbalancing list (`cb_list`, 1–64) that sets the
membership, the trial order, the order of the animal pairs (Latin square,
`pair_order`), Team A in the no-group condition, and the sides of the scale
(`swap_sides`). The app chooses the least used membership for this age, then
the least used trial order within it, then the least used list. Sessions
are counted from the Google Sheet when it can be reached (all devices),
otherwise from this device. Test runs and incomplete sessions are not counted.

Randomised within each session (and recorded per trial):

- whether the good-reason team is shown first: once in each condition's two
  trials, so in 2 of 4 trials;
- which animal each team claims: Team A claims the first animal of the pair in
  2 trials and the second in the other 2.

## Data (one row per trial)

| Column(s) | Meaning |
|---|---|
| `membership`, `membership_assigned` | group / no_group; balanced or by hand |
| `trial_order`, `cb_list`, `pair_order`, `swap_sides` | counterbalancing |
| `team_a`, `team_b`, `child_team` | group: Team A = the child's team; no-group: Team A from the list |
| `sticker_member_gender`, `sticker_pic_left` | gender of the two members; the team shown left (liking and sticker screens) |
| `liking_moon_member`, `liking_sun_member` | really_like … really_not_like |
| `liking_team_a`, `liking_team_b` | the same as scores (4 = really like … 1 = really not like) |
| `stickers_to_moon_member`, `stickers_to_sun_member`, `stickers_team_a`, `stickers_team_b` | sticker allocation |
| `practice_*` | scale practice (from trial 1 on) |
| `trial`, `condition` | 1–4; IG / OG / T1 / T2 |
| `animal_moon`, `animal_sun`, `good_team`, `good_animal`, `weak_animal` | who claimed what |
| `team_first`, `good_first` | team shown first; whether that was the good-reason team |
| `belief_check_good` / `_weak`, `reason_check_good` / `_weak` | correct / after_replay / no (how many tries: `*_n_tries`) |
| `solution_animal` | the animal shown as the majority on the solution screen (the final belief; middle = the first choice) |
| `belief1_choice`, `good_confirms_initial` | initial animal; yes / no / dont_know (initial in the middle) |
| `rating1_raw`, `rating2_raw` | scale position, −100 (left) … 100 (right) |
| `rating*_toward_good`, `change_toward_good` | positive = toward the good-reason team's animal |
| `rating*_toward_team_a`, `change_toward_team_a` | positive = toward Team A's animal (group: own team) |
| `rating1_side`, `rating2_side` | good / weak / middle |
| `switch_to_good` | crossed the middle toward the good reason (only filled when the initial belief was on the weak side) |
| `belief_vid1_*`, `belief_vid2_*`, `reason_vid1_*`, `reason_vid2_*` | per video: team, role, file, plays, check result and the answers of each try |

## Setup

**Videos.** After new or changed recordings arrive in `../video_stimuli/`, run
the following from this folder:

    swift tools/prepare_videos.swift

The script makes only what is missing or out of date. It finds each source
file by its number (`38.2-…`), so typos in the rest of a file name do not
matter.

**Google Sheet.** Connected (`SHEETS_URL` in `data.js`; its own sheet, not
the Study 1 sheet). After changing `google_sheets/Code.gs`, paste it into the
sheet's Apps Script and use Deploy > Manage deployments > edit > Version: New
version, so that the URL stays the same.

**Testing on this computer.** Run `sh tools/run_local.sh`.
It opens the task in the browser and prints an address that an iPad on the
same Wi-Fi can use. Stop it with Ctrl+C. Tick "test run" on the start form, so
the session is not counted.

**Publishing (GitHub Pages, as Study 1).** This folder is the git repository
`HannaSchleihauf/Group_Reason_Study_2`. GitHub Pages serves its `docs/`
folder (Settings > Pages: branch `main`, folder `/docs`) at
https://hannaschleihauf.github.io/Group_Reason_Study_2/. After changing
anything in `Study2_Web`, run

    sh tools/make_site_folder.sh

and then commit and push (including `docs/`). (`tools/make_hostinger_zip.sh` is still there for a web host such as
Hostinger.)
