# Third-party notices

## DeepSeek-V4.1-Flash tokenizer (MIT)

Pinned repository: `deepseek-ai/DeepSeek-V4.1-Flash`

Pinned revision: `dba1be0a40aa45a94ad051997016db3960a90277`

Only tokenizer data/config/license are bundled; no model weights, inference engine, remote code or runtime download. The original MIT license is bundled at [LICENSE](lib/tokenizer-assets/deepseek-v4.1-flash/LICENSE).

| File | Bytes | SHA-256 | Source URL |
|---|---:|---|---|
| tokenizer.json | 6367257 | `c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b` | https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/resolve/dba1be0a40aa45a94ad051997016db3960a90277/tokenizer.json |
| tokenizer_config.json | 801 | `6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547` | https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/resolve/dba1be0a40aa45a94ad051997016db3960a90277/tokenizer_config.json |
| LICENSE | 1084 | `f2c6c602815669d292889e5be8c802f2ed950653b77999b1584e8e6aed25d040` | https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/resolve/dba1be0a40aa45a94ad051997016db3960a90277/LICENSE |

## js-yaml@4.3.2 (MIT)

The upstream pure ESM bundle is copied byte-for-byte, with its original [MIT LICENSE](lib/vendor/js-yaml/LICENSE). DSH parses and re-serializes the profile patch with this exact library and dialect (`JSON_SCHEMA` plus the `!!js` scalar type); Memory compares the managed preset-budget block with the same dialect, and a profile install cannot resolve host packages from a plugin, so the parser is vendored instead of imported. Package source: https://registry.npmjs.org/js-yaml/-/js-yaml-4.3.2.tgz

| Vendored file | Upstream package path | Bytes | SHA-256 |
|---|---|---:|---|
| js-yaml.mjs | dist/js-yaml.mjs | 104118 | `cea276c7e15f409a1adbe5d177aba7824398a474f7cf702bd57962c7d570636f` |
| LICENSE | LICENSE | 1084 | `a07bc24468b9654ce76a547d47a2db282d07733b715db4c73a98bd63961f9550` |

## @huggingface/tokenizers@0.2.0 (Apache-2.0)

The upstream pure JavaScript ESM bundle is copied byte-for-byte, with its original [Apache-2.0 LICENSE](lib/vendor/huggingface-tokenizers/LICENSE). No native compilation, inference packages or install scripts. Package source: https://registry.npmjs.org/@huggingface/tokenizers/-/tokenizers-0.2.0.tgz

| Vendored file | Upstream package path | Bytes | SHA-256 |
|---|---|---:|---|
| tokenizers.mjs | dist/tokenizers.mjs | 98937 | `1c4a848f86156201c033d6cd08c4cf81ae1088552acec3367f31ef086edf5af0` |
| LICENSE | LICENSE | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |

Counts use `encode(text, {add_special_tokens:false})` over actual framed Memory text, separately per emitted message. They do not claim to include provider-specific chat-role/template overhead, unrelated context or billing. The tokenizer name/revision and cross-model estimation caveat are retained in diagnostics/description. The Memory and Dreaming card bodies each have a single passive token/countdown readout while retaining their interactive controls. Native instructions remain a visible region inside Memory, without a second token total. Planned-versus-committed provenance and estimation details are retained only in diagnostics. If this tokenizer cannot load, a clearly labeled UTF-8/3 heuristic v1 estimates counts; diagnostics retain the failure reason.
