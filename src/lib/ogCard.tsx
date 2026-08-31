export function Pip() {
  return (
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 999,
        background: "#2b170a",
        display: "flex",
      }}
    />
  );
}

export function OgCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fbf6ef",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 300,
            height: 300,
            borderRadius: 64,
            background: "linear-gradient(135deg, #ffc257 0%, #ff6b3d 100%)",
            boxShadow: "0 18px 0 0 #7a2c12",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: 190,
              height: 190,
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Pip />
              <Pip />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Pip />
              <Pip />
            </div>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
              }}
            >
              <Pip />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 108,
              fontWeight: 800,
              color: "#241c15",
              letterSpacing: -2,
            }}
          >
            MyLudo
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 34,
              color: "#8a7c6a",
              maxWidth: 620,
            }}
          >
            Play Ludo online with friends — any device, no install needed.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 28,
              fontWeight: 700,
              color: "#ff6b3d",
            }}
          >
            myludo.life
          </div>
        </div>
      </div>
    </div>
  );
}
