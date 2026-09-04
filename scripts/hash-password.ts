import { hashPassword } from "@/lib/auth/password";

hashPassword("test1234").then(console.log);
