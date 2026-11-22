import { memo } from "react";

const paint = (id: string, name: string) => "url(#" + id + "-" + name + ")";

const Inks = memo(function Inks({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient
        id={id + "-wall"}
        x1="0"
        y1="0"
        x2="1"
        y2="1"
        gradientUnits="objectBoundingBox"
      >
        <stop stopColor="#dddac7" />
        <stop offset=".48" stopColor="#c3c9bd" />
        <stop offset="1" stopColor="#8ea9a1" />
      </linearGradient>
      <linearGradient id={id + "-light"} x1="0" x2="1" y1="0" y2="1">
        <stop stopColor="#fff1d4" />
        <stop offset="1" stopColor="#e4d9b8" />
      </linearGradient>
      <linearGradient id={id + "-hair"} x1="0" x2="1" y1="0" y2="1">
        <stop stopColor="#43596a" />
        <stop offset=".34" stopColor="#293c52" />
        <stop offset=".72" stopColor="#1c2b41" />
        <stop offset="1" stopColor="#111e32" />
      </linearGradient>
      <linearGradient id={id + "-skin"} x1="0" x2=".9" y1="0" y2="1">
        <stop stopColor="#ffe7ce" />
        <stop offset=".55" stopColor="#f9d5bd" />
        <stop offset="1" stopColor="#eabbac" />
      </linearGradient>
      <linearGradient id={id + "-jacket"} x1="0" x2="1" y1="0" y2="1">
        <stop stopColor="#568983" />
        <stop offset=".46" stopColor="#39726e" />
        <stop offset="1" stopColor="#204e50" />
      </linearGradient>
      <linearGradient id={id + "-amber"} x1="0" x2="0" y1="0" y2="1">
        <stop stopColor="#624537" />
        <stop offset=".45" stopColor="#9e683d" />
        <stop offset=".8" stopColor="#dca661" />
        <stop offset="1" stopColor="#f2d68b" />
      </linearGradient>
    </defs>
  );
});

const Backdrop = memo(function Backdrop({ id }: { id: string }) {
  return (
    <g>
      <path fill={paint(id, "wall")} d="M0 0H360V360H0Z" />
      <path
        d="M-14 32L74 0H138L0 108Z M281 0H301L0 222V206Z"
        fill="#fff4d7"
        opacity=".22"
      />
      <circle
        cx="162"
        cy="133"
        r="113"
        fill={paint(id, "light")}
        opacity=".85"
      />
      <circle
        cx="162"
        cy="133"
        r="118"
        fill="none"
        stroke="#f8edcf"
        strokeWidth=".8"
      />
      <path
        d="M257 360V84Q257 29 309 14M266 360V85Q266 41 309 24"
        fill="none"
        stroke="#70918c"
        strokeWidth="1"
        opacity=".37"
      />
      <g fill="#6e9188" opacity=".27">
        <path d="M361 67Q339 76 323 102Q344 99 361 80Z M361 92Q345 110 343 135Q357 126 361 117Z" />
        <path d="M361 121Q334 124 314 143Q340 146 361 130Z M361 147Q345 161 339 180Q356 173 361 163Z" />
        <path d="M0 267Q17 245 32 242Q27 257 0 272Z M1 283Q23 264 43 265Q31 281 1 288Z" />
      </g>
    </g>
  );
});

const Wardrobe = memo(function Wardrobe({
  id,
  greeting,
}: {
  id: string;
  greeting: boolean;
}) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* A fitted jacket, with an ivory blouse visible between the peaked lapels. */}
      <path
        d="M138 213Q126 227 99 235L71 245Q56 253 48 276L24 365H296L287 297Q280 253 261 244L208 224L193 212Z"
        fill={paint(id, "jacket")}
        stroke="#253f44"
        strokeWidth="1.8"
      />
      <path
        d="M137 213L163 224L193 210L211 226L189 316L167 362L120 260Z"
        fill="#f7edda"
      />
      <path
        d="M145 227L169 251L183 233L164 267Z M173 256L164 329L154 360H169Z"
        fill="#d8d5c7"
      />
      <path
        d="M138 206Q155 214 175 212L192 195Q188 213 200 224Q192 238 169 246Q150 240 137 223Z"
        fill={paint(id, "skin")}
        stroke="#b28679"
        strokeWidth="1.15"
      />
      <path
        d="M142 205Q160 215 180 206L189 196Q186 210 190 216Q170 225 146 222Z"
        fill="#cb978d"
      />
      <path
        d="M135 214L147 228L169 246L153 256L132 230Z M191 213L200 222L190 249L172 245Z"
        fill="#fff6e6"
        stroke="#b9b9aa"
        strokeWidth="1.2"
      />
      <path d="M171 247Q175 263 170 284" fill="none" stroke="#b7afa2" />
      <circle cx="171.7" cy="259" r="1.6" fill="#b9a177" />
      <path
        d="M135 215L113 229L104 249L117 251L111 263L166 360L155 295Z"
        fill="#76a19a"
        stroke="#345f60"
        strokeWidth="1.45"
      />
      <path
        d="M117 236L111 246L124 249L119 262L150 319"
        fill="none"
        stroke="#acd0bb"
        strokeWidth="1"
      />
      <path
        d="M194 213L213 224L229 240L212 245L218 254L171 342L163 360Q185 303 194 213Z"
        fill="#63928b"
        stroke="#2d5456"
        strokeWidth="1.45"
      />
      <path
        d="M210 226L222 238L206 244L213 254L188 301"
        fill="none"
        stroke="#a9c6ac"
        strokeWidth="1.05"
      />
      <path
        d="M75 249Q63 267 64 286L60 326L48 360H25L46 280Q52 260 63 254Z M96 275L96 317L86 360H66Q79 337 82 314Z M233 254Q229 282 220 303L216 360H258L259 284Z"
        fill="#2b595a"
      />
      <path
        d="M79 247Q67 266 68 290M86 302Q77 323 60 334M218 313L241 308"
        fill="none"
        stroke="#254d50"
        strokeWidth="1.3"
      />
      <path
        d="M220 290L242 285L243 289L219 295Z"
        fill="#709991"
        stroke="#30595a"
        strokeWidth="1"
      />
      <path
        d="M170 337L169 362"
        fill="none"
        stroke="#254d50"
        strokeWidth="1.3"
      />
      <circle cx="176" cy="337" r="3.2" fill="#c9a36b" stroke="#715c47" />
      {/* Her other hand rests on the edge of the lapel. */}
      <path
        d="M65 346Q74 331 92 326L113 314Q118 311 120 314Q121 317 115 322L127 315Q132 312 133 316Q133 319 125 324L134 321Q138 320 138 323Q137 327 127 330L134 328Q139 328 136 332L119 341Q108 347 92 348L78 359Z"
        fill={paint(id, "skin")}
        stroke="#a57870"
        strokeWidth="1.2"
      />
      <path
        d="M104 336Q112 330 119 328M93 339Q99 335 103 331"
        fill="none"
        stroke="#c99788"
        strokeWidth="1"
      />
      <path
        d="M42 355L78 328L93 347L76 363H39Z"
        fill="#67958e"
        stroke="#2e5859"
        strokeWidth="1.4"
      />
      <path d="M76 330L89 347L85 351L72 333Z" fill="#ebdfc8" />
      {greeting ? (
        <g>
          {/* Bent right arm, with sleeve and cuff ending at the waving wrist. */}
          <path
            d="M251 241Q264 242 270 257L279 278L279 250L286 232L308 239Q304 270 298 302Q292 325 278 331Q263 333 251 316L231 276Q225 252 251 241Z"
            fill={paint(id, "jacket")}
            stroke="#2a5053"
            strokeWidth="1.7"
          />
          <path
            d="M246 247Q260 248 265 264L278 293L274 312L259 302L248 285Z"
            fill="#52857f"
          />
          <path
            d="M252 303Q266 310 279 322Q286 318 292 308M280 287Q285 275 297 265M279 303L271 292"
            fill="none"
            stroke="#2f595a"
            strokeWidth="1.1"
          />
          <path
            d="M282 244L285 231L308 236L306 248Z"
            fill="#f3ead7"
            stroke="#647d77"
            strokeWidth="1.1"
          />
          <path d="M283 244L306 249L304 254L282 249Z" fill="#57847d" />
          <circle cx="301" cy="257" r="1.9" fill="#d5bb84" />
        </g>
      ) : (
        <g className="seorin__resting-sleeve">
          <path
            d="M247 240Q265 241 275 257Q282 269 286 287L298 333L305 362H264L250 320Q240 290 237 270Q234 249 247 240Z"
            fill={paint(id, "jacket")}
            stroke="#2c5052"
            strokeWidth="1.5"
          />
          <path
            d="M247 242Q259 244 267 258Q273 274 276 297Q267 283 263 266Q257 249 247 242Z"
            fill="#619089"
          />
          <path
            d="M242 273Q251 296 265 304L278 333L283 362H263L251 323Z"
            fill="#2f5d5d"
          />
          <path
            d="M250 279Q252 293 259 302M262 311Q272 322 283 325M281 336Q291 337 295 333"
            fill="none"
            stroke="#315c5d"
            strokeWidth="1.2"
          />
        </g>
      )}
    </g>
  );
});

const HairBehind = memo(function HairBehind({ id }: { id: string }) {
  return (
    <g strokeLinejoin="round">
      <path
        d="M111 207Q89 214 69 218Q83 202 79 186Q68 169 72 141Q72 123 67 114Q75 115 78 121Q69 87 88 61Q103 34 135 29Q155 15 185 22Q200 24 208 32Q227 37 237 59Q250 78 246 105Q242 123 248 147Q256 171 250 190Q249 201 257 211Q243 211 235 204Q237 215 244 222Q220 219 209 207Q207 222 213 228Q188 222 181 207L151 211Q136 228 116 232Q123 222 124 213Q107 225 93 224Z"
        fill={paint(id, "hair")}
        stroke="#243143"
        strokeWidth="2"
      />
      <path
        d="M87 115Q91 159 84 182Q89 203 80 211Q106 202 107 177L114 207L120 217Q142 212 148 193L192 188Q200 211 212 216L211 196Q228 208 235 209Q224 186 230 172Q243 198 250 202Q245 192 247 178Q232 134 239 104Z"
        fill="#172539"
      />
      <path
        d="M75 143Q74 169 85 182 M85 192Q86 212 74 216 M227 171Q225 197 238 212 M247 152Q254 177 249 186"
        fill="none"
        stroke="#6b818b"
        strokeWidth="1.05"
      />
    </g>
  );
});

const Fringe = memo(function Fringe({ id }: { id: string }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M78 125Q72 94 82 70Q98 33 134 31Q157 18 182 23Q196 25 208 34Q233 39 242 67Q249 86 241 110Q235 130 239 149Q244 166 242 185Q232 177 229 165Q229 185 238 198Q217 186 216 163Q213 147 220 120Q225 101 219 84Q211 107 191 118Q199 104 199 90Q181 118 159 122Q173 108 180 92Q155 116 126 122Q114 125 106 133Q110 119 124 109Q106 118 99 136Q92 156 100 179Q104 193 100 205Q95 194 91 189Q91 204 83 215Q84 198 79 183Q70 160 78 125Z"
        fill={paint(id, "hair")}
        stroke="#263448"
        strokeWidth="1.7"
      />
      <path
        d="M85 96Q94 54 131 43Q156 28 181 30Q146 32 132 50Q162 32 184 33Q146 44 121 75L107 88Q124 56 146 44Q113 54 92 89Z"
        fill="#526777"
      />
      <path
        d="M96 96Q119 56 160 42Q139 54 131 68Q122 69 110 86L116 74Z M147 58Q164 41 183 38Q168 43 159 56L153 57L145 69Z"
        fill="#798b94"
        opacity=".75"
      />
      <path
        d="M82 114Q83 91 98 72Q86 97 87 117Q81 140 87 165Q80 155 79 138Z M165 111Q183 91 198 64Q199 90 182 106Q195 82 192 83Z"
        fill="#415669"
      />
      <path
        d="M135 117Q170 101 189 66Q179 99 157 117Z M204 43Q229 54 235 74Q227 59 213 57Z M226 100Q233 130 227 150Q225 165 230 177Q219 164 222 146Z"
        fill="#5a6d7b"
      />
      <g fill="none" stroke="#24354a" strokeWidth="1.1">
        <path d="M207 38Q183 23 151 30 M198 38Q171 33 148 48 M195 41Q168 45 146 69 M186 62Q153 95 126 102 M184 77Q163 102 136 111 M198 64Q198 91 185 105 M207 66Q213 83 201 103 M104 94Q86 115 85 142 M234 103Q230 129 235 146" />
      </g>
      <g fill="none" stroke="#92a39f" opacity=".78" strokeWidth=".85">
        <path d="M85 91Q100 47 142 39 M108 74Q126 50 145 45 M154 47Q175 34 185 34 M215 43Q231 48 238 66 M82 153Q83 173 91 183" />
      </g>
      <path
        d="M106 130Q94 149 101 170Q106 185 102 197Q109 189 106 173Q98 151 110 138Z M216 108Q216 127 211 140Q208 156 216 165Q212 151 216 138Q223 117 221 104Z"
        fill="#293b4e"
      />
      {/* A single brass barrette, parallel to the sweep above the temple. */}
      <path
        d="M217 78L233 67Q235 66 236 68L236 70L219 83Q216 84 215.8 81Z"
        fill="#d5aa67"
        stroke="#665b4f"
        strokeWidth="1.15"
      />
      <path
        d="M219 79.5L233.5 69"
        fill="none"
        stroke="#fff0b5"
        strokeWidth="1.4"
      />
      <path
        d="M99 50Q128 22 155 24Q175 16 194 22 M202 29Q218 28 226 39"
        fill="none"
        stroke="#394b5e"
        strokeWidth="1.2"
      />
    </g>
  );
});

const Face = memo(function Face({ id }: { id: string }) {
  return (
    <g>
      <path
        d="M102 123Q106 88 139 68Q177 51 208 74Q228 88 226 118L222 151Q219 175 202 195Q188 211 173 218Q166 221 159 217Q135 209 119 192Q107 178 100 157Q90 151 91 139Q91 127 102 123Z"
        fill={paint(id, "skin")}
        stroke="#956d67"
        strokeWidth="1.5"
      />
      <path
        d="M101 121Q115 90 143 79Q182 49 218 86L224 108Q216 95 210 94Q205 110 193 122Q200 109 200 102Q182 118 164 126Q169 122 172 118Q150 125 128 128Q112 131 107 144Q101 171 121 193Q102 178 99 154L96 139Z"
        fill="#d9a597"
      />
      <path
        d="M221 151Q215 178 196 197Q181 213 169 216Q181 211 201 189Q211 177 215 164Z"
        fill="#e0b0a1"
      />
      <path
        d="M96 139Q102 132 105 143Q101 140 99 143Q104 148 103 152"
        fill="none"
        stroke="#bb897d"
        strokeWidth="1.2"
      />
      <path
        d="M159 145Q157 157 155 162Q158 166 163 166L160 164Z"
        fill="#dca899"
      />
      <path
        d="M157 164Q159 166 161 165 M169 164L170 163"
        stroke="#ba887c"
        fill="none"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M159 154L161 151M156.5 161.5L159 162"
        stroke="#ffe6ce"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M116 159Q128 155 137 159Q128 164 117 163Z M184 159Q195 155 206 157L202 161Q192 163 184 159Z"
        fill="#edb9ad"
        opacity=".82"
      />
      <path
        d="M118 161L120 158M123 162L125 159M199 160L201 157M194 160L196 158"
        stroke="#d09b92"
        fill="none"
        strokeWidth=".85"
        strokeLinecap="round"
      />
      <circle cx="190" cy="158.7" r=".9" fill="#9a7467" />
      <path
        d="M159 204Q166 207 171 204"
        stroke="#f7d3bd"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M102 156Q108 164 104 172Q99 176 98 169"
        fill="none"
        stroke="#9c8054"
        strokeWidth="2.2"
      />
      <circle cx="103" cy="157" r="2.1" fill="#f4df99" />
      <path
        d="M101 174L104 180L101 185L98 179Z"
        fill="#d7b778"
        stroke="#9e8665"
        strokeWidth=".75"
      />
    </g>
  );
});

export const seorinArt = { Inks, Backdrop, Wardrobe, HairBehind, Face, Fringe };
