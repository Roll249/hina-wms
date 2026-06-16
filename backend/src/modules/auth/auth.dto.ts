import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class PinLoginDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  @Matches(/^[0-9]+$/, { message: 'PIN phải là 4-6 chữ số' })
  pin!: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
