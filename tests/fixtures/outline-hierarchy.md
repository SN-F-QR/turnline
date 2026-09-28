# Synthetic outline hierarchy scenarios

`outline-hierarchy.json` contains invented heading sequences and explicit expected
depths. Unit tests and browser tests share this data. Browser tests insert the
sequences into response wrappers from the existing offline ChatGPT, Claude and
Gemini fixtures; this models heading variation, rather than capturing new host DOM.

Each sequence is a separate response within the same conversation. Heading text
is generated from the scenario ID and position, without real conversation data.
The original captured HTML and its raw heading levels remain unchanged.
