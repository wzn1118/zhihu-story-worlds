# Zhihu Skill Installation

Installed and verified in this run:

| Component | Value |
| --- | --- |
| Skill | `0.5.3-beta.20260904115023` |
| Skill directory | `E:/CodexHome/skills/zhihu` |
| Official CLI | `0.5.0-beta.20260826061344` |
| CLI path | `C:/Users/10847/AppData/Local/ZhihuCLI/current/zhihu-cli.exe` |
| Credential storage | Windows credential store, supplied through stdin |
| Authentication | `auth status --verify` succeeded |
| Minimal business check | `me contents --type all --limit 1` returned `Code: 0` |
| Archive SHA256 | `f7b1de244c875749feec7fae5b134e2de5f26332198e6c73861140b2d72c4dd7` |

Package URL:
<https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.5.3-beta.20260904115023/zhihu-cli-skill-0.5.3-beta.20260904115023.zip>

The installed Skill's status reported both CLI and Skill compatible with its
beta manifest, with no update pending at verification time. The downloaded
archive's hash matched the official beta manifest.

Full prior Skill backup:
`E:/CodexHome/backups/zhihu-skill-20260906-0345/zhihu-0.4.0`.

## Story Capability

The Skill's `references/hackathon-content-api.md` explicitly says the story
endpoints are outside official CLI subcommands. They use no authentication.
The game implements that documented HTTP capability and provides a project-local
CLI. It does not rewrite or impersonate the official CLI.

- List: `https://api.zhihu.com/km-indep-home/hackathon/v2/story/list`
- Detail: `https://api.zhihu.com/km-indep-home/hackathon/v2/story/{work_id}`

These are hackathon-specific endpoints. The source excerpts are incomplete;
game branches and endings are original adaptations rather than source endings.

## Image Channel

OpenQI is configured separately in `E:/CodexHome/openqi-imagegen.env` with image
model `gpt-image-2`. This application does not serve, import or copy that file.
Generated game assets are delivered into `public/assets` after inspection; receipts
and private recovery artifacts stay outside the public web root.
