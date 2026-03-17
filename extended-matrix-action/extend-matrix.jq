def toGHAMatrix: {"include": . };

# Chunk an array into arrays of `n` size
def nwise($n):
 def _nwise:
   if length <= $n then . else .[0:$n] , (.[$n:]|_nwise) end;
 _nwise;

# Sample Input:
# { "version": ["1.0", "2.0"], "framework": ["django", "flask"] }

# Get the keys present in matrix
# These are useful after getting combinations as an array
[to_entries[] | .key] as $matrixKeys # ["version", "framework"]
| [ # Convert the stream of objects into an array
    # Convert the stream of objects into an array
    [
        # Get the values for each key
        # Output: ["1.0", "2.0"]["django", "flask"]
        [ . | to_entries[] | .value ]
        # Get combinations for all the values
        # Output: ["1.0","django"] ["1.0","flask"] ["2.0","django"] ["2.0","flask"]
        | combinations
        # Convert to a generic object
        # Output: [{"key":0,"value":"1.0"},{"key":1,"value":"django"}] [{"key":0,"value":"1.0"},{"key":1,"value":"flask"}] [{"key":0,"value":"2.0"},{"key":1,"value":"django"}] [{"key":0,"value":"2.0"},{"key":1,"value":"flask"}]
        | to_entries
        # Convert each item to an object using the original keys
        # Output: [{"framework":"1.0"},{"version":"django"}] [{"framework":"1.0"},{"version":"flask"}] [{"framework":"2.0"},{"version":"django"}] [{"framework":"2.0"},{"version":"flask"}]
        | map( { ($matrixKeys[.key]): .value } )
        # Combine the outputs to a single object
        # Output: {"framework":"1.0","version":"django"} {"framework":"1.0","version":"flask"} {"framework":"2.0","version":"django"} {"framework":"2.0","version":"flask"}
        | add
    ]
    # Create chunks
    # Example uses a chunk of 2:
    # Output: [{"framework":"1.0","version":"django"},{"framework":"1.0","version":"flask"}] [{"framework":"2.0","version":"django"},{"framework":"2.0","version":"flask"}]
    | nwise(100)
]
# Output: [{"key":0,"value":[{"framework":"1.0","version":"django"},{"framework":"1.0","version":"flask"}]},{"key":1,"value":[{"framework":"2.0","version":"django"},{"framework":"2.0","version":"flask"}]}]
| to_entries
# Convert the output into GHA format with inner items serialized to a string
# Output: [{"name":0,"items":"{\"include\":[{\"framework\":\"1.0\",\"version\":\"django\"},{\"framework\":\"1.0\",\"version\":\"flask\"}]}"},{"name":1,"items":"{\"include\":[{\"framework\":\"2.0\",\"version\":\"django\"},{\"framework\":\"2.0\",\"version\":\"flask\"}]}"}]
| map({
    "name": .key,
    "items": .value | toGHAMatrix | tostring
})
# Add the `include` key
# Output: {"include":[{"name":0,"items":"{\"include\":[{\"framework\":\"1.0\",\"version\":\"django\"},{\"framework\":\"1.0\",\"version\":\"flask\"}]}"},{"name":1,"items":"{\"include\":[{\"framework\":\"2.0\",\"version\":\"django\"},{\"framework\":\"2.0\",\"version\":\"flask\"}]}"}]}
| toGHAMatrix