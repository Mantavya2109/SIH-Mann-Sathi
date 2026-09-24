from flask import Flask, jsonify, render_template_string
import requests

app = Flask(__name__)

# ============================================================
# THINGSPEAK
# ============================================================

CHANNEL_ID = "165462"

# If channel is PUBLIC, keep empty.
# If PRIVATE, put the READ API KEY here.
READ_API_KEY = "QCIUYHR4XXUIJ5TV"

THINGSPEAK_URL = (
    f"https://api.thingspeak.com/channels/"
    f"{CHANNEL_ID}/feeds.json"
)


# ============================================================
# THINGSPEAK DATA
# ============================================================

def get_thingspeak():

    params = {
        "results": 50
    }

    if READ_API_KEY.strip():
        params["api_key"] = READ_API_KEY.strip()

    try:

        r = requests.get(
            THINGSPEAK_URL,
            params=params,
            timeout=10
        )

        print("ThingSpeak status:", r.status_code)

        r.raise_for_status()

        return r.json()

    except Exception as e:

        print("ThingSpeak error:", e)

        return {
            "feeds": [],
            "error": str(e)
        }


# ============================================================
# SAFE NUMBER
# ============================================================

def to_number(value):

    if value is None:
        return None

    try:

        value = str(value).strip()

        if value == "":
            return None

        return float(value)

    except:

        return None


# ============================================================
# GET LAST VALID FIELD VALUE
# ============================================================

def last_valid(feeds, field):

    # Search from newest to oldest
    for feed in reversed(feeds):

        value = to_number(
            feed.get(field)
        )

        if value is not None:

            return value

    return None


# ============================================================
# STRESS TEXT
# ============================================================

def stress_text(value):

    if value is None:
        return "--"

    value = int(value)

    if value == 0:
        return "LOW"

    if value == 1:
        return "MEDIUM"

    if value == 2:
        return "HIGH"

    return "--"


# ============================================================
# FALL TEXT
# ============================================================

def fall_text(value):

    if value is None:
        return "--"

    value = int(value)

    if value == 1:
        return "FALL"

    if value == 0:
        return "NORMAL"

    return "--"


# ============================================================
# PROCESS HISTORY
# ============================================================

def process_history(feeds):

    history = []

    for feed in feeds:

        history.append({

            "time":
                feed.get(
                    "created_at",
                    ""
                ),

            "bpm":
                to_number(
                    feed.get("field1")
                ),

            "spo2":
                to_number(
                    feed.get("field2")
                ),

            "temperature":
                to_number(
                    feed.get("field3")
                ),

            "stress":
                to_number(
                    feed.get("field4")
                ),

            "fall":
                to_number(
                    feed.get("field5")
                )

        })

    return history


# ============================================================
# API
# ============================================================

@app.route("/api/data")
def api_data():

    ts = get_thingspeak()

    feeds = ts.get("feeds", [])

    if not feeds:

        return jsonify({

            "success": False,

            "bpm": None,
            "spo2": None,
            "temperature": None,
            "stress": None,
            "fall": None,

            "history": [],

            "message":
                ts.get(
                    "error",
                    "No ThingSpeak data"
                )
        })


    # ========================================================
    # IMPORTANT:
    # Get latest VALID value from each field
    # ========================================================

    bpm = last_valid(
        feeds,
        "field1"
    )

    spo2 = last_valid(
        feeds,
        "field2"
    )

    temperature = last_valid(
        feeds,
        "field3"
    )

    stress = last_valid(
        feeds,
        "field4"
    )

    fall = last_valid(
        feeds,
        "field5"
    )


    history = process_history(feeds)


    print(
        "LATEST:",
        "BPM =", bpm,
        "SpO2 =", spo2,
        "TEMP =", temperature,
        "STRESS =", stress,
        "FALL =", fall
    )


    return jsonify({

        "success": True,

        "bpm": bpm,

        "spo2": spo2,

        "temperature": temperature,

        "stress": stress,

        "fall": fall,

        "time":
            feeds[-1].get(
                "created_at",
                "--"
            ),

        "history": history
    })


# ============================================================
# DEBUG
# ============================================================

@app.route("/api/debug")
def debug():

    data = get_thingspeak()

    return jsonify(data)


# ============================================================
# DASHBOARD HTML
# ============================================================

HTML = """

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1.0">

<title>ESP32 Health Monitoring</title>


<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>


<style>

* {
    box-sizing: border-box;
}


body {

    margin: 0;

    font-family: Arial, sans-serif;

    background:
    linear-gradient(
        135deg,
        #07111f,
        #12304a,
        #07111f
    );

    color: white;

    min-height: 100vh;
}


.header {

    text-align: center;

    padding: 25px;

    background:
    rgba(0,0,0,0.35);

}


.header h1 {

    margin: 0;

    font-size: 30px;

}


.header p {

    color: #aabbd0;

}


.status {

    display: inline-block;

    padding: 7px 18px;

    border-radius: 20px;

    background: #173b28;

    color: #55ff99;

}


.container {

    width: 95%;

    max-width: 1400px;

    margin: 25px auto;
}


.cards {

    display: grid;

    grid-template-columns:
    repeat(
        auto-fit,
        minmax(220px,1fr)
    );

    gap: 20px;
}


.card {

    padding: 25px;

    border-radius: 20px;

    background:
    rgba(255,255,255,0.08);

    border:
    1px solid
    rgba(255,255,255,0.12);

    box-shadow:
    0 10px 30px
    rgba(0,0,0,0.25);
}


.card-icon {

    font-size: 38px;

    margin-bottom: 8px;
}


.card-title {

    color: #b8c8d9;

    font-size: 15px;

    margin-bottom: 12px;
}


.value {

    font-size: 42px;

    font-weight: bold;
}


.unit {

    color: #aebed0;

    font-size: 17px;
}


.bpm {
    border-left: 5px solid #ff4f81;
}

.spo2 {
    border-left: 5px solid #42d9ff;
}

.temp {
    border-left: 5px solid #ffb347;
}

.stress {
    border-left: 5px solid #c084fc;
}

.fall {
    border-left: 5px solid #ff5555;
}


.normal {

    color: #55ff99;
}


.warning {

    color: #ffd166;
}


.danger {

    color: #ff5555;
}


.panel {

    margin-top: 25px;

    padding: 25px;

    border-radius: 20px;

    background:
    rgba(255,255,255,0.08);

    border:
    1px solid
    rgba(255,255,255,0.1);
}


.panel h2 {

    margin-top: 0;
}


.chart {

    height: 350px;
}


table {

    width: 100%;

    border-collapse: collapse;
}


th,
td {

    padding: 12px;

    text-align: center;

    border-bottom:
    1px solid
    rgba(255,255,255,0.1);
}


th {

    color: #78d8ff;
}


.footer {

    text-align: center;

    padding: 30px;

    color: #8192a5;
}


</style>

</head>


<body>


<div class="header">

<h1>❤️ ESP32 HEALTH MONITORING</h1>

<p>
Real-Time IoT Health Dashboard
</p>

<div
class="status"
id="connection">

● CONNECTING...

</div>

</div>


<div class="container">


<!-- =====================================================
     CARDS
====================================================== -->


<div class="cards">


<!-- BPM -->

<div class="card bpm">

<div class="card-icon">
❤️
</div>

<div class="card-title">
HEART RATE
</div>

<div>

<span
class="value"
id="bpm">

--

</span>

<span class="unit">
BPM
</span>

</div>

</div>


<!-- SPO2 -->

<div class="card spo2">

<div class="card-icon">
🫁
</div>

<div class="card-title">
BLOOD OXYGEN
</div>

<div>

<span
class="value"
id="spo2">

--

</span>

<span class="unit">
%
</span>

</div>

</div>


<!-- TEMPERATURE -->

<div class="card temp">

<div class="card-icon">
🌡️
</div>

<div class="card-title">
BODY TEMPERATURE
</div>

<div>

<span
class="value"
id="temperature">

--

</span>

<span class="unit">
°C
</span>

</div>

</div>


<!-- STRESS -->

<div class="card stress">

<div class="card-icon">
🧠
</div>

<div class="card-title">
STRESS LEVEL
</div>

<div>

<span
class="value"
id="stress">

--

</span>

</div>

</div>


<!-- FALL -->

<div class="card fall">

<div class="card-icon">
🚨
</div>

<div class="card-title">
FALL STATUS
</div>

<div>

<span
class="value"
id="fall">

--

</span>

</div>

</div>


</div>


<!-- DEVICE STATUS -->

<div class="panel">

<h2>📡 Device Status</h2>

<p>

Last ThingSpeak update:

<strong id="lastUpdate">
--
</strong>

</p>

</div>


<!-- CHART -->

<div class="panel">

<h2>📊 Health Trends</h2>

<div class="chart">

<canvas id="healthChart"></canvas>

</div>

</div>


<!-- HISTORY -->

<div class="panel">

<h2>📋 Recent Measurements</h2>

<div style="overflow-x:auto;">

<table>

<thead>

<tr>

<th>Time</th>

<th>❤️ BPM</th>

<th>🫁 SpO₂</th>

<th>🌡️ Temperature</th>

<th>🧠 Stress</th>

<th>🚨 Fall</th>

</tr>

</thead>

<tbody
id="dataTable">

</tbody>

</table>

</div>

</div>


</div>


<div class="footer">

ESP32 + MAX30105 + DS18B20 + MPU6050 + ThingSpeak

</div>



<script>


let chart = null;


// ======================================================
// FORMAT NUMBER
// ======================================================

function number(value, decimals)
{

    if (
        value === null ||
        value === undefined
    )
        return "--";


    let n = Number(value);


    if (isNaN(n))
        return "--";


    return n.toFixed(decimals);

}


// ======================================================
// STRESS
// ======================================================

function stress(value)
{

    if (
        value === null ||
        value === undefined
    )
        return "--";


    let n = Number(value);


    if (n === 0)
        return "LOW";


    if (n === 1)
        return "MEDIUM";


    if (n === 2)
        return "HIGH";


    return "--";

}


// ======================================================
// FALL
// ======================================================

function fall(value)
{

    if (
        value === null ||
        value === undefined
    )
        return "--";


    let n = Number(value);


    if (n === 0)
        return "NORMAL";


    if (n === 1)
        return "FALL";


    return "--";

}


// ======================================================
// LOAD DATA
// ======================================================

function loadData()
{

    fetch(
        "/api/data?t=" +
        Date.now()
    )

    .then(
        response =>
            response.json()
    )

    .then(data => {


        console.log(
            "Dashboard data:",
            data
        );


        if (!data.success)
        {

            document.getElementById(
                "connection"
            ).innerHTML =
                "● NO DATA";

            return;

        }


        document.getElementById(
            "connection"
        ).innerHTML =
            "● CONNECTED";


        // ==================================================
        // BPM
        // ==================================================

        document.getElementById(
            "bpm"
        ).innerText =
            number(
                data.bpm,
                0
            );


        // ==================================================
        // SPO2
        // ==================================================

        document.getElementById(
            "spo2"
        ).innerText =
            number(
                data.spo2,
                1
            );


        // ==================================================
        // TEMPERATURE
        // ==================================================

        document.getElementById(
            "temperature"
        ).innerText =
            number(
                data.temperature,
                1
            );


        // ==================================================
        // STRESS
        // ==================================================

        let stressElement =
            document.getElementById(
                "stress"
            );


        stressElement.innerText =
            stress(
                data.stress
            );


        if (
            Number(data.stress) === 2
        )
        {

            stressElement.className =
                "value danger";

        }

        else if (
            Number(data.stress) === 1
        )
        {

            stressElement.className =
                "value warning";

        }

        else
        {

            stressElement.className =
                "value normal";

        }


        // ==================================================
        // FALL
        // ==================================================

        let fallElement =
            document.getElementById(
                "fall"
            );


        fallElement.innerText =
            fall(
                data.fall
            );


        if (
            Number(data.fall) === 1
        )
        {

            fallElement.className =
                "value danger";

        }

        else
        {

            fallElement.className =
                "value normal";

        }


        // ==================================================
        // TIME
        // ==================================================

        document.getElementById(
            "lastUpdate"
        ).innerText =
            data.time || "--";


        // ==================================================
        // HISTORY
        // ==================================================

        updateChart(
            data.history
        );


        updateTable(
            data.history
        );


    })

    .catch(error => {

        console.error(error);

        document.getElementById(
            "connection"
        ).innerHTML =
            "● CONNECTION ERROR";

    });

}


// ======================================================
// CHART
// ======================================================

function updateChart(history)
{

    if (
        !history ||
        history.length === 0
    )
        return;


    let data =
        history.slice(-20);


    let labels =
        data.map(
            item => {

                if (!item.time)
                    return "";

                return new Date(
                    item.time
                ).toLocaleTimeString();

            }
        );


    let bpm =
        data.map(
            item => item.bpm
        );


    let spo2 =
        data.map(
            item => item.spo2
        );


    let temp =
        data.map(
            item => item.temperature
        );


    if (chart)
        chart.destroy();


    let ctx =
        document
        .getElementById(
            "healthChart"
        )
        .getContext("2d");


    chart =
        new Chart(
            ctx,
            {

                type: "line",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "❤️ BPM",

                            data: bpm,

                            borderWidth: 3,

                            tension: 0.35

                        },

                        {

                            label:
                                "🫁 SpO₂",

                            data: spo2,

                            borderWidth: 3,

                            tension: 0.35

                        },

                        {

                            label:
                                "🌡️ Temperature",

                            data: temp,

                            borderWidth: 3,

                            tension: 0.35

                        }

                    ]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    interaction: {

                        mode: "index",

                        intersect: false

                    }

                }

            }
        );

}


// ======================================================
// TABLE
// ======================================================

function updateTable(history)
{

    let table =
        document.getElementById(
            "dataTable"
        );


    table.innerHTML = "";


    if (!history)
        return;


    let recent =
        history
        .slice()
        .reverse()
        .slice(0,10);


    recent.forEach(
        item => {

            let row =
                document.createElement(
                    "tr"
                );


            let time =
                item.time || "--";


            if (
                time !== "--"
            )
            {

                time =
                    new Date(
                        time
                    ).toLocaleString();

            }


            row.innerHTML = `

                <td>${time}</td>

                <td>
                    ${number(item.bpm,0)}
                </td>

                <td>
                    ${number(item.spo2,1)}
                </td>

                <td>
                    ${number(item.temperature,1)}
                </td>

                <td>
                    ${stress(item.stress)}
                </td>

                <td>
                    ${fall(item.fall)}
                </td>

            `;


            table.appendChild(
                row
            );

        }
    );

}


// ======================================================
// START
// ======================================================

loadData();


// ThingSpeak updates every 15 seconds
// Refresh dashboard every 10 seconds

setInterval(
    loadData,
    10000
);


</script>


</body>

</html>

"""


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():

    return render_template_string(
        HTML
    )


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    print("")
    print("======================================")
    print(" ESP32 HEALTH MONITORING DASHBOARD")
    print("======================================")
    print(
        "Channel:",
        CHANNEL_ID
    )
    print(
        "ThingSpeak:",
        THINGSPEAK_URL
    )
    print("")
    print(
        "Dashboard:"
    )
    print(
        "http://127.0.0.1:5000"
    )
    print("")
    print(
        "Debug:"
    )
    print(
        "http://127.0.0.1:5000/api/debug"
    )
    print("======================================")


    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
