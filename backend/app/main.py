from fastapi import FastAPI

app = FastAPI(title="SIH Mental Health Monitoring API")

@app.get("/")
def home():
    return {"message": "SIH Backend is running"}