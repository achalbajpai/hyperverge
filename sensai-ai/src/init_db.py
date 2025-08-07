import asyncio
from api.db import init_db

async def initialize_database():
    print("Initializing database...")
    await init_db()
    print("Database initialization complete!")

if __name__ == "__main__":
    asyncio.run(initialize_database())
