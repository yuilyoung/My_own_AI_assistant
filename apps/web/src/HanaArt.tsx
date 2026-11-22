import { memo } from "react";

type ArtProps = { id: string };
type WardrobeProps = ArtProps & { greeting: boolean };
const paint = (id: string, color: string) => `url(#${id}-${color})`;

const Inks = memo(function Inks({ id }: ArtProps) {
  return (
    <defs>
      <linearGradient id={id + "-plaster"} x2=".88" y2="1">
        <stop stopColor="#fcdfae" />
        <stop offset=".55" stopColor="#efc38d" />
        <stop offset="1" stopColor="#da9c72" />
      </linearGradient>
      <linearGradient id={id + "-skin"} x1=".24" x2=".78" y2="1">
        <stop stopColor="#ffe1be" />
        <stop offset=".53" stopColor="#f6c399" />
        <stop offset="1" stopColor="#e6a784" />
      </linearGradient>
      <radialGradient id={id + "-cheek"}>
        <stop stopColor="#e69a80" stopOpacity=".72" />
        <stop offset=".66" stopColor="#e99e83" stopOpacity=".44" />
        <stop offset="1" stopColor="#efab88" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={id + "-copper"} x1=".15" x2=".79" y2="1">
        <stop stopColor="#e6a061" />
        <stop offset=".31" stopColor="#c67543" />
        <stop offset=".67" stopColor="#a65032" />
        <stop offset="1" stopColor="#763a32" />
      </linearGradient>
      <linearGradient id={id + "-canvas"} x2="1" y2=".9">
        <stop stopColor="#647b76" />
        <stop offset=".45" stopColor="#425f61" />
        <stop offset="1" stopColor="#2e494d" />
      </linearGradient>
      <linearGradient id={id + "-linen"} x2=".65" y2="1">
        <stop stopColor="#fff1d1" />
        <stop offset=".63" stopColor="#efdab6" />
        <stop offset="1" stopColor="#caac91" />
      </linearGradient>
      <linearGradient id={id + "-glaze"} x1=".16" x2=".9" y2="1">
        <stop stopColor="#b9d7bd" />
        <stop offset=".54" stopColor="#79a998" />
        <stop offset="1" stopColor="#517d76" />
      </linearGradient>
      <linearGradient id={id + "-amber"} x2="0" y2="1">
        <stop stopColor="#2e433e" />
        <stop offset=".42" stopColor="#486f55" />
        <stop offset=".76" stopColor="#86a876" />
        <stop offset="1" stopColor="#d7d99a" />
      </linearGradient>
    </defs>
  );
});

const Backdrop = memo(function Backdrop({ id }: ArtProps) {
  return (
    <g className="hana__studio" strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 0H360V360H0Z" fill={paint(id, "plaster")} />
      {/* Late light enters the pottery studio through an arched casement. */}
      <path d="M-13 195V67Q-13 7 43 5Q95 7 95 63V195Z" fill="#cd9468" />
      <path d="M-8 188V65Q-8 14 42 11Q86 13 87 63V188Z" fill="#fff0c2" />
      <path
        d="M-8 116L78 40L82 53L-8 133Z M5 188L87 107V125L22 188Z"
        fill="#fff8dd"
      />
      <path d="M34 13H38V191H34Z M-5 80H90V84H-5Z" fill="#dfb486" />
      <path d="M0 188H94V193H0Z" fill="#ba8566" />
      <path d="M0 199H82L0 267Z" fill="#fae2b0" opacity=".65" />
      {/* Two fired vessels and a stoneware brush jar sit on open shelves. */}
      <path d="M259 113H360V118H259Z M273 195H360V201H273Z" fill="#aa7056" />
      <path d="M259 112H360 M273 194H360" stroke="#fce4b2" strokeWidth="2" />
      <path
        d="M270 107Q260 96 269 85Q275 77 274 68L272 66V63H289V66L286 68Q285 74 291 82Q303 96 292 108Q283 113 270 107Z"
        fill="#d8dfbf"
        stroke="#ac9576"
        strokeWidth="1.2"
      />
      <path
        d="M269 93Q280 98 294 94M268 99Q282 104 294 99"
        fill="none"
        stroke="#69938c"
        strokeWidth="2.7"
      />
      <path d="M273 64Q280 66 288 64" fill="none" stroke="#9b9e83" />
      <path
        d="M315 110Q303 102 308 92Q313 85 315 80L314 75H332V79Q331 84 340 94Q345 103 336 109Q324 113 315 110Z"
        fill="#be7655"
      />
      <path
        d="M312 93Q322 98 336 93M312 97Q323 102 337 97"
        fill="none"
        stroke="#f2c191"
        strokeWidth="1.2"
      />
      <g fill="none" strokeWidth="2.3">
        <path
          d="M323 168L315 134M325 169L331 129M330 170L346 138"
          stroke="#a47654"
        />
        <path
          d="M315 137Q313 130 313 126M331 132L333 121M345 141L349 133"
          stroke="#796d58"
          strokeWidth="3.7"
        />
      </g>
      <path
        d="M311 162Q327 159 342 162L337 191Q327 196 316 191Z"
        fill="#ab7257"
      />
      <path
        d="M312 164Q327 169 342 163 M315 181Q326 184 339 181"
        fill="none"
        stroke="#e5af82"
        strokeWidth="2"
      />
      <path d="M0 276L360 233V360H0Z" fill="#cf916e" opacity=".62" />
      <path d="M0 285L360 240" fill="none" stroke="#fae1b6" opacity=".6" />
    </g>
  );
});

const Wardrobe = memo(function Wardrobe({ id, greeting }: WardrobeProps) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M137 210Q123 222 97 231L75 238Q57 244 48 263L29 320L35 363H292L279 276Q276 249 258 240L204 218L193 207Z"
        fill={paint(id, "linen")}
        stroke="#8f6957"
        strokeWidth="1.7"
      />
      <path
        d="M77 244Q63 261 62 288L47 307L62 314L75 294L86 254Z M249 243Q259 260 254 286L242 321L258 361H284L273 277Z"
        fill="#d4b595"
      />
      <path
        d="M130 210Q145 229 164 242Q184 233 199 214L211 223Q192 258 166 264Q140 252 119 224Z"
        fill="#b86543"
      />
      <path
        d="M142 193L144 211Q144 220 132 224Q141 240 164 249Q183 241 198 223Q187 219 187 208L189 194Z"
        fill={paint(id, "skin")}
        stroke="#b57b62"
        strokeWidth="1.15"
      />
      <path d="M143 203Q159 221 177 217L188 209L188 200Z" fill="#d19879" />
      <path
        d="M132 217Q141 239 164 249Q181 243 198 217L202 224Q186 251 165 257Q141 250 127 224Z"
        fill="#e6bd91"
      />
      <path
        d="M127 217Q137 236 157 250L145 258L122 231Z M199 216L208 223L186 252L174 249Q189 236 199 216Z"
        fill="#fff1cf"
        stroke="#b9977d"
        strokeWidth="1.15"
      />
      {/* Stitched straps, brass workwear hardware, and a clay-marked canvas bib. */}
      <path
        d="M102 230L117 224L130 276L116 281Z M206 225L222 231L212 276L197 274Z"
        fill="#9b583d"
        stroke="#754634"
        strokeWidth="1.5"
      />
      <path
        d="M106 232L119 273 M218 234L208 271"
        fill="none"
        stroke="#e7bc83"
        strokeDasharray="2 3"
      />
      <path
        d="M111 264Q162 278 216 262L229 297Q234 315 251 323L259 363H73L81 320Q102 310 105 291Z"
        fill={paint(id, "canvas")}
        stroke="#354d4b"
        strokeWidth="1.65"
      />
      <path
        d="M109 270Q161 283 215 269 M84 323Q103 312 107 292M220 285Q229 313 248 320"
        fill="none"
        stroke="#abc0a4"
        strokeWidth="1"
        strokeDasharray="3 2.8"
      />
      <path
        d="M112 264L125 267L126 275L115 274Z M201 266L213 264L212 273L200 275Z"
        fill="#87513b"
      />
      <path
        d="M115 267L122 268M203 268L210 267"
        stroke="#e4bb76"
        strokeWidth="3"
      />
      <path
        d="M93 332Q105 341 111 362H79Z M221 303Q223 331 244 362H253Q239 336 240 319Z"
        fill="#345154"
      />
      <path
        d="M179 294L196 290L201 317L180 322Z"
        fill="#344d4d"
        stroke="#78918a"
      />
      <path d="M183 302L182 284Q185 281 187 284L188 301Z" fill="#b48550" />
      <path d="M190 300L192 279Q193 276 195 279L194 300Z" fill="#eed7a4" />
      <path
        d="M176 305L200 301L202 319L179 324Z"
        fill="#647b73"
        stroke="#354e50"
      />
      <path
        d="M179 309L199 305 M181 321L199 317"
        fill="none"
        stroke="#ccd3b4"
        strokeDasharray="2 3"
      />
      <g fill="#bec3a8" opacity=".68">
        <path d="M119 296Q121 292 124 295L122 299Z M135 303Q138 300 139 304L137 306Z M128 319L131 313L130 321Z M213 339L224 333L219 339L211 341Z M104 349L109 346L105 352Z" />
        <circle cx="124" cy="307" r="1.15" />
        <circle cx="132" cy="293" r=".9" />
      </g>
      {greeting ? (
        <g>
          <path
            d="M248 239Q264 240 272 260L277 274L284 232L305 236Q305 277 296 303Q291 316 282 322Q271 327 258 317L236 287Z"
            fill={paint(id, "skin")}
            stroke="#966c57"
            strokeWidth="1.45"
          />
          <path
            d="M277 276Q278 287 274 296Q282 287 285 262L290 235L285 233Z M261 308Q270 319 281 317L289 310Q281 329 268 320Z"
            fill="#da9979"
          />
          <path
            d="M240 239Q254 236 265 246Q273 255 279 277L263 292L240 284Q229 259 240 239Z"
            fill={paint(id, "linen")}
            stroke="#947459"
            strokeWidth="1.3"
          />
          <path
            d="M237 273Q251 269 274 267L280 284Q268 294 244 299L238 291L241 286Z"
            fill="#bd754f"
            stroke="#915c44"
            strokeWidth="1.35"
          />
          <path
            d="M242 279L273 271M245 292L277 280"
            fill="none"
            stroke="#e1a275"
            strokeWidth="2"
          />
        </g>
      ) : (
        <g className="seorin__resting-sleeve">
          <path
            d="M249 240Q266 242 275 265L288 302L294 324L264 332L242 291Q230 259 249 240Z"
            fill={paint(id, "linen")}
            stroke="#96735a"
            strokeWidth="1.5"
          />
          <path
            d="M249 254Q259 271 261 290L280 299Q270 285 267 271Z"
            fill="#d3b291"
          />
          <path
            d="M266 308L289 303Q299 325 303 362H274L261 332Z"
            fill={paint(id, "skin")}
            stroke="#a87963"
            strokeWidth="1.4"
          />
          <path
            d="M258 299L282 290L291 292L295 311L264 322L256 314Z"
            fill="#b86a49"
            stroke="#92583e"
            strokeWidth="1.35"
          />
          <path
            d="M262 304L287 295M267 314L291 305"
            stroke="#e2a77c"
            strokeWidth="2.5"
          />
        </g>
      )}
      {/* Hana cradles a wheel-thrown bowl in the crook of her left arm. */}
      <path
        d="M53 266Q46 280 39 303L33 323L58 333L79 311L87 283Z"
        fill={paint(id, "linen")}
      />
      <path
        d="M39 293L66 302L72 313L62 327L30 317Z"
        fill="#bf7652"
        stroke="#945d45"
        strokeWidth="1.2"
      />
      <path
        d="M37 298L65 308M34 309L61 319"
        stroke="#e3a57c"
        strokeWidth="2.3"
      />
      <path
        d="M33 319Q23 344 42 354Q53 362 76 351L102 340L95 326L61 335L58 327Z"
        fill={paint(id, "skin")}
        stroke="#a66e57"
        strokeWidth="1.35"
      />
      <path
        d="M61 306Q67 334 91 341L96 347Q108 350 122 347L125 342Q145 335 151 310Z"
        fill={paint(id, "glaze")}
        stroke="#4d7266"
        strokeWidth="1.5"
      />
      <ellipse
        cx="106"
        cy="308"
        rx="45"
        ry="7"
        fill="#e3ddad"
        stroke="#537d6f"
        strokeWidth="1.4"
      />
      <ellipse cx="106" cy="308.5" rx="39.5" ry="3.4" fill="#88a595" />
      <path
        d="M64 314Q106 325 149 314M94 340Q107 344 124 340"
        fill="none"
        stroke="#d2dbc0"
        strokeWidth="2"
      />
      <path
        d="M69 320Q76 327 86 328M132 325L137 322"
        fill="none"
        stroke="#a4c1a6"
        strokeWidth="2"
      />
      <path
        d="M48 344Q59 335 72 333L86 327Q91 324 92 327Q93 330 86 334L97 330Q102 328 103 331Q102 334 94 337L101 335Q106 334 105 337Q104 340 94 344L78 349Q65 357 51 353Z"
        fill={paint(id, "skin")}
        stroke="#af795e"
        strokeWidth="1.2"
      />
      <path
        d="M70 342L79 337M89 339L96 336"
        fill="none"
        stroke="#ce9274"
        strokeWidth="1"
      />
    </g>
  );
});

const HairBehind = memo(function HairBehind({ id }: ArtProps) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Off-centre, looped copper bun with escaping curls at the crown. */}
      <path
        d="M88 64C73 65 68 52 73 42Q66 31 78 23C85 12 94 13 98 14Q104 4 118 9C127 2 137 6 141 10Q156 6 166 20Q180 23 179 35C190 46 180 62 168 67L115 83Z"
        fill={paint(id, "copper")}
        stroke="#713e32"
        strokeWidth="2"
      />
      <path
        d="M81 48Q72 38 80 31Q80 46 93 49Q81 37 86 27Q90 18 101 18Q89 28 94 38Q98 49 111 53Q96 35 104 23Q112 11 126 12Q110 21 109 34Q110 45 121 57L108 67Z"
        fill="#ab5838"
      />
      <path
        d="M115 16Q132 8 141 17Q149 28 137 40Q145 23 135 18Q125 15 115 16Z M144 19Q163 13 167 32Q168 44 157 50Q166 39 161 29Q155 20 144 19Z"
        fill="#f5b876"
      />
      <path
        d="M85 48Q73 34 88 21M94 42Q88 25 103 18M110 34Q113 18 127 16M125 54Q133 39 130 30M150 49Q167 43 169 33"
        fill="none"
        stroke="#85462e"
        strokeWidth="1.3"
      />
      <path
        d="M79 31Q83 19 95 19M115 16Q124 11 130 13M139 13Q153 10 160 18"
        fill="none"
        stroke="#fbd19a"
        strokeWidth="1.45"
      />
      <path
        d="M73 46Q60 40 64 30Q68 23 73 28Q75 32 71 34 M103 14Q101 3 111 4Q115 4 116 8 M167 29Q175 18 182 24Q187 28 184 33"
        fill="none"
        stroke="#955535"
        strokeWidth="1.55"
      />
      <path
        d="M85 143Q70 126 78 105Q72 83 86 68Q92 47 120 44Q147 32 172 42Q200 38 222 62Q244 79 241 106Q251 123 240 141Q244 159 230 170Q234 179 226 190Q231 174 219 172Q201 191 182 184L128 179Q116 185 109 181Q113 180 111 177Q96 184 93 174Q80 169 87 157Q81 152 85 143Z"
        fill={paint(id, "copper")}
        stroke="#763f33"
        strokeWidth="1.9"
      />
      <path
        d="M84 125Q92 152 108 147L126 165L203 152Q229 146 236 124Q242 148 227 160Q217 168 222 180Q213 177 213 170Q205 182 182 177L135 175Q115 187 100 176Q97 164 88 161Q95 148 84 139Z"
        fill="#864534"
      />
      <path
        d="M87 155Q77 160 83 169Q87 175 94 170 M224 164Q238 169 231 180M235 129Q244 139 238 147"
        fill="none"
        stroke="#a15d40"
        strokeWidth="1.4"
      />
    </g>
  );
});

const Face = memo(function Face({ id }: ArtProps) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path
        d="M110 129Q101 119 93 127Q85 135 92 149Q98 157 107 158Z M215 131Q225 122 232 130Q238 139 227 151L216 157Z"
        fill={paint(id, "skin")}
        stroke="#a9745c"
        strokeWidth="1.4"
      />
      <path
        d="M95 137Q97 129 102 136L101 145M225 135Q231 131 229 139L224 146"
        fill="none"
        stroke="#c58c71"
        strokeWidth="1.35"
      />
      <path
        d="M105 117C101 99 116 75 134 68Q169 50 195 64Q219 77 225 100Q230 124 222 153Q218 175 204 191Q191 207 173 214Q164 219 154 215Q130 207 116 191Q103 176 100 157Q98 136 105 117Z"
        fill={paint(id, "skin")}
        stroke="#ad775f"
        strokeWidth="1.7"
      />
      <path
        d="M104 121Q101 102 124 80Q169 52 200 74L218 96Q208 92 204 86Q205 101 193 111Q196 103 192 95Q184 111 164 116Q176 105 177 97Q164 107 144 109Q123 111 111 126L104 143Z"
        fill="#e9ad86"
      />
      <path
        d="M101 153Q105 175 120 191Q135 206 157 215Q140 212 126 202Q106 190 99 165Z M221 149Q216 174 204 189Q190 207 172 214Q189 210 208 190Q220 175 223 160Z"
        fill="#e7ae8a"
      />
      {/* A low, rounded nose and irregular sun freckles spanning both cheeks. */}
      <path
        d="M159 146Q161 153 155 160Q152 164 158 166Q163 168 167 164Q162 165 160 163Q158 161 161 157Z"
        fill="#e2a180"
      />
      <path
        d="M155 164Q157 166 159 165M165 165Q168 163 170 164"
        fill="none"
        stroke="#bc8066"
        strokeWidth="1.2"
      />
      <path
        d="M159 157L160 154M156.5 161.6L159 161.7"
        fill="none"
        stroke="#ffe4c6"
        strokeWidth="1.9"
      />
      <ellipse cx="124" cy="161" rx="19" ry="6" fill={paint(id, "cheek")} />
      <ellipse cx="198" cy="159" rx="18" ry="6.5" fill={paint(id, "cheek")} />
      <g fill="#b67a58">
        <circle cx="112.5" cy="157" r="1.05" />
        <circle cx="117.4" cy="162" r=".85" />
        <circle cx="121" cy="158" r="1.25" />
        <circle cx="125.1" cy="163.1" r=".8" />
        <circle cx="128" cy="159.3" r="1.05" />
        <circle cx="134.3" cy="160" r=".85" />
        <circle cx="140" cy="157.9" r=".7" />
        <circle cx="150" cy="157.8" r=".7" />
        <circle cx="155" cy="156.2" r=".78" />
        <circle cx="164" cy="155.7" r=".86" />
        <circle cx="170" cy="157" r=".75" />
        <circle cx="179.7" cy="156.3" r=".86" />
        <circle cx="186.2" cy="158.3" r="1" />
        <circle cx="190.8" cy="156.4" r="1.15" />
        <circle cx="194" cy="161.1" r=".85" />
        <circle cx="199" cy="157.7" r="1.05" />
        <circle cx="205" cy="154.8" r=".72" />
        <circle cx="207.7" cy="159.3" r=".88" />
      </g>
      <path
        d="M122 165L124 164M198 164L200 163"
        stroke="#ffd5b0"
        strokeWidth="1.25"
      />
      <path
        d="M156 201Q164 204 171 201"
        fill="none"
        stroke="#fbd3ae"
        strokeWidth="1.6"
      />
      {/* Hand-thrown celadon earrings are finished with a tiny warm brass stud. */}
      <path
        d="M98 149Q93 156 99 162Q103 165 105 158"
        fill="none"
        stroke="#ab7d47"
        strokeWidth="2"
      />
      <circle
        cx="99.3"
        cy="151"
        r="2.4"
        fill="#ecca80"
        stroke="#b08b54"
        strokeWidth=".65"
      />
      <path
        d="M99 161Q92 165 96 171Q102 175 105 169Q106 165 101 161Z"
        fill={paint(id, "glaze")}
        stroke="#6a8574"
        strokeWidth="1"
      />
      <path d="M97.4 166.2L99.6 164.1" stroke="#e1e6c6" strokeWidth="1.4" />
      <circle
        cx="226.3"
        cy="151"
        r="2.2"
        fill="#d9b76c"
        stroke="#98764f"
        strokeWidth=".8"
      />
    </g>
  );
});

const Fringe = memo(function Fringe({ id }: ArtProps) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* The swept fringe breaks into broad S-curves, with a loose corkscrew at each temple. */}
      <path
        d="M86 137Q74 131 80 117Q72 105 78 90Q78 77 91 65Q100 53 116 52Q139 39 160 42Q180 38 199 48Q224 54 234 77Q247 100 237 118Q230 130 235 139Q242 152 232 161Q226 167 219 162Q227 162 228 156Q231 150 226 144Q217 134 222 118Q224 109 219 96Q216 109 205 114Q211 104 206 97Q198 117 184 117Q193 108 189 100Q177 118 163 117Q173 108 173 99Q160 108 145 104Q134 105 125 116Q128 107 132 102Q112 104 106 121Q105 130 99 137Q91 145 96 154Q102 163 96 170Q91 176 85 170Q95 173 92 163Q89 157 84 151Q79 144 86 137Z"
        fill={paint(id, "copper")}
        stroke="#854633"
        strokeWidth="1.65"
      />
      <path
        d="M83 114Q76 104 83 91Q80 108 89 112L91 103Q100 85 119 80Q107 88 102 96Q119 88 135 89Q122 94 115 102Q99 105 95 123Q91 137 85 140Q90 130 86 124Z"
        fill="#aa583b"
      />
      <path
        d="M112 90Q136 72 165 71Q157 77 141 80Q159 78 174 69Q161 83 143 88Q128 91 119 103Q123 91 134 85Z M177 77Q188 68 202 74Q209 78 208 88Q204 79 198 78Q202 89 195 97Q195 85 188 83Q188 98 177 104Q183 87 179 84L174 88Z"
        fill="#e69a59"
      />
      <path
        d="M119 83Q137 70 151 71L141 75L149 75L130 82L136 77Z M157 76Q169 71 175 66Q171 74 162 77Z M182 75Q192 68 200 75L192 73L186 77Z"
        fill="#f6bd7a"
      />
      <path
        d="M102 119Q103 104 119 97 M122 99Q134 88 151 85 M147 101Q163 98 173 88 M165 114Q176 105 178 94 M187 111Q197 99 194 91 M208 106Q215 95 210 87 M226 120Q232 107 226 97 M89 145Q88 153 94 159"
        fill="none"
        stroke="#8b4931"
        strokeWidth="1.1"
      />
      <path
        d="M85 111Q81 102 84 96M88 135Q94 126 94 118M108 101Q115 93 121 90M140 91Q151 88 156 85M223 136Q222 130 225 125"
        fill="none"
        stroke="#edac70"
        strokeWidth="1.45"
      />
      <path
        d="M86 150Q75 156 80 164Q83 169 88 167M228 157Q240 157 240 149Q239 144 236 145"
        fill="none"
        stroke="#a65e3e"
        strokeWidth="1.35"
      />

      {/* The indigo kerchief wraps the hair behind her fringe and ties at the temple. */}
      <g className="hana__kerchief">
        <path
          d="M83 107Q74 82 91 63Q111 40 142 38Q181 28 210 51Q224 61 229 76L222 84Q212 63 190 54Q163 44 136 51Q102 57 90 84Q87 93 87 104Z"
          fill="#47686b"
          stroke="#3d5555"
          strokeWidth="1.65"
        />
        <path
          d="M84 100Q82 77 101 61Q125 43 157 42Q198 40 221 68"
          fill="none"
          stroke="#78948b"
          strokeWidth="2.1"
        />
        <path
          d="M86 98Q86 77 106 61M124 49Q139 43 156 44M194 49Q201 52 208 58"
          fill="none"
          stroke="#abbaa4"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        <g fill="#f3db9e">
          <path d="M91 70l1-4 3-1-1 4z M106 55l2-4 3 1-2 3z M126 45l3-3 3 1-3 3z M151 39l4-2 2 2-4 2z M176 38l4 1-1 3-4-2z M199 49l3 1v3l-4-2z M212 57l3 2v3l-4-3z" />
          <circle cx="99.5" cy="61" r="1.1" />
          <circle cx="139" cy="42" r="1.2" />
          <circle cx="187" cy="44" r="1.1" />
        </g>
        <path
          d="M222 75Q228 57 246 56Q249 55 253 53Q250 65 242 72Q237 77 229 80Z"
          fill="#64817b"
          stroke="#3c5755"
          strokeWidth="1.5"
        />
        <path
          d="M228 78Q240 74 249 81Q257 88 265 87Q257 98 245 93Q235 88 225 81Z"
          fill="#436569"
          stroke="#3b5556"
          strokeWidth="1.5"
        />
        <path
          d="M229 76Q239 64 247 60M234 80Q241 80 248 86"
          fill="none"
          stroke="#95a99a"
          strokeWidth="1.3"
        />
        <path
          d="M226 73Q231 73 233 78L230 83L223 84L220 79Z"
          fill="#71897c"
          stroke="#3c5756"
          strokeWidth="1.35"
        />
        <path
          d="M239 66l3-2 1 2-3 2zM245 87l3 1-1 2-3-1zM251 89l3 1-1 1-3-1z"
          fill="#eed69a"
        />
      </g>
    </g>
  );
});

export const hanaArt = { Inks, Backdrop, Wardrobe, HairBehind, Face, Fringe };
