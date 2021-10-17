with import <nixpkgs> {};
stdenv.mkDerivation {
    name = "dash-to-dock";
    buildInputs = [ gnumake glib sassc ];
}
